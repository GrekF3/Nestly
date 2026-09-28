import { DurableObject } from "cloudflare:workers";
import type { CreateMockPaymentIntent, MockPaymentEvent, MockPaymentIntent, NotificationEvent } from "../../../packages/shared/worker-contract";
import { nextPaymentStatus, parseCreateIntent, parseNotification, parsePaymentEvent, sameCreateIntent } from "./domain";
import { signRequest, stableIntentId, verifySignedRequest } from "./security";

type RuntimeEnv = Env & {
  /** Stored with `wrangler secret put`; never configured as plaintext vars. */
  INTERNAL_HMAC_SECRET: string;
  MOCK_PROVIDER_HMAC_SECRET: string;
  CALLBACK_HMAC_SECRET: string;
  BACKEND_CALLBACK_URL: string;
};

type CreateResult = { kind: "created" | "existing" | "conflict"; intent: MockPaymentIntent };
type ApplyResult = { kind: "applied" | "duplicate" | "invalid" | "missing" | "tenant_mismatch"; intent?: MockPaymentIntent };

export class PaymentIntentObject extends DurableObject<RuntimeEnv> {
  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS payment_intent (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        processed_at INTEGER NOT NULL
      );
    `);
  }

  private current(): MockPaymentIntent | null {
    const row = this.ctx.storage.sql.exec<{
      id: string; tenant_id: string; user_id: string; listing_id: string;
      amount_minor: number; currency: string; status: MockPaymentIntent["status"];
      created_at: number; updated_at: number;
    }>("SELECT * FROM payment_intent LIMIT 1").toArray()[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      listingId: row.listing_id,
      amountMinor: row.amount_minor,
      currency: "THB",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: "mock",
      liveCharge: false,
    };
  }

  create(id: string, request: CreateMockPaymentIntent): CreateResult {
    const existing = this.current();
    if (existing) return {
      kind: sameCreateIntent(existing, request) ? "existing" : "conflict",
      intent: existing,
    };
    const now = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO payment_intent VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
      id, request.tenantId, request.userId, request.listingId,
      request.amountMinor, request.currency, now, now,
    );
    const intent = this.current();
    if (!intent) throw new Error("Intent persistence failed");
    return { kind: "created", intent };
  }

  getForTenant(tenantId: string): MockPaymentIntent | null {
    const intent = this.current();
    return intent?.tenantId === tenantId ? intent : null;
  }

  applyEvent(event: MockPaymentEvent): ApplyResult {
    const intent = this.current();
    if (!intent) return { kind: "missing" };
    if (intent.tenantId !== event.tenantId) return { kind: "tenant_mismatch" };
    const prior = this.ctx.storage.sql.exec<{ event_id: string }>(
      "SELECT event_id FROM processed_events WHERE event_id = ?", event.eventId,
    ).toArray()[0];
    if (prior) return { kind: "duplicate", intent };
    const next = nextPaymentStatus(intent.status, event.status);
    if (!next) return { kind: "invalid", intent };
    const now = Date.now();
    // Synchronous SQL writes coalesce atomically inside the Durable Object.
    this.ctx.storage.sql.exec("UPDATE payment_intent SET status = ?, updated_at = ? WHERE id = ?", next, now, intent.id);
    this.ctx.storage.sql.exec(
      "INSERT INTO processed_events (event_id, status, processed_at) VALUES (?, ?, ?)",
      event.eventId, next, now,
    );
    return { kind: "applied", intent: { ...intent, status: next, updatedAt: now } };
  }
}

function json(data: object, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function limitedText(request: Request, limit = 16_384): Promise<string | null> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

async function processRequest(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ status: "ok", service: "yuu-operations", payments: "mock-only" });
  }
  if ((env.INTERNAL_HMAC_SECRET?.length ?? 0) < 32 || (env.MOCK_PROVIDER_HMAC_SECRET?.length ?? 0) < 32) {
    return json({ error: "Service not configured" }, 503);
  }
  if (url.search) return json({ error: "Query strings are not accepted" }, 400);
  const raw = request.method === "GET" ? "" : await limitedText(request);
  if (raw === null) return json({ error: "Body too large" }, 413);
  const providerWebhook = url.pathname === "/v1/mock-webhooks/payments";
  const secret = providerWebhook ? env.MOCK_PROVIDER_HMAC_SECRET : env.INTERNAL_HMAC_SECRET;
  if (!await verifySignedRequest(request, raw, secret)) return json({ error: "Unauthorized" }, 401);

  if (url.pathname === "/v1/payment-intents" && request.method === "POST") {
    const payload = parseCreateIntent(parseJson(raw));
    const key = request.headers.get("idempotency-key");
    if (!payload || !key || !/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
      return json({ error: "Invalid intent or Idempotency-Key" }, 400);
    }
    const id = await stableIntentId(env.INTERNAL_HMAC_SECRET, payload.tenantId, key);
    const result = await env.PAYMENT_INTENTS.getByName(id).create(id, payload);
    if (result.kind === "conflict") return json({ error: "Idempotency key reused with different intent" }, 409);
    return json({ intent: result.intent, idempotentReplay: result.kind === "existing" }, result.kind === "created" ? 201 : 200);
  }

  const intentPath = /^\/v1\/tenants\/([A-Za-z0-9_-]{1,100})\/payment-intents\/(mpi_[a-f0-9]{64})$/.exec(url.pathname);
  if (intentPath && request.method === "GET") {
    const intent = await env.PAYMENT_INTENTS.getByName(intentPath[2]).getForTenant(intentPath[1]);
    return intent ? json({ intent }) : json({ error: "Not found" }, 404);
  }

  if (providerWebhook && request.method === "POST") {
    const event = parsePaymentEvent(parseJson(raw));
    if (!event) return json({ error: "Invalid event" }, 400);
    const result = await env.PAYMENT_INTENTS.getByName(event.intentId).applyEvent(event);
    if (result.kind === "missing" || result.kind === "tenant_mismatch") return json({ error: "Not found" }, 404);
    if (result.kind === "invalid") return json({ error: "Invalid payment transition" }, 409);
    return json({ accepted: true, duplicate: result.kind === "duplicate", intent: result.intent });
  }

  if (url.pathname === "/v1/notifications" && request.method === "POST") {
    const event = parseNotification(parseJson(raw));
    if (!event) return json({ error: "Invalid notification event" }, 400);
    await env.NOTIFICATIONS.send(event);
    return json({ eventId: event.eventId, status: "queued" }, 202);
  }
  return json({ error: "Not found" }, 404);
}

async function deliverNotification(event: NotificationEvent, env: RuntimeEnv): Promise<void> {
  if (!env.BACKEND_CALLBACK_URL || (env.CALLBACK_HMAC_SECRET?.length ?? 0) < 32) throw new Error("Callback not configured");
  const callback = new URL(env.BACKEND_CALLBACK_URL);
  if (callback.protocol !== "https:" || callback.search || callback.hash) throw new Error("Invalid callback URL");
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await signRequest(env.CALLBACK_HMAC_SECRET, timestamp, "POST", callback.pathname, body);
  const response = await fetch(callback, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Yuu-Timestamp": String(timestamp),
      "X-Yuu-Signature": signature,
      "X-Yuu-Event-Id": event.eventId,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Callback status ${response.status}`);
}

export default {
  async fetch(request: Request, env: RuntimeEnv): Promise<Response> {
    try {
      return await processRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({ event: "operations_request_failed", kind: error instanceof Error ? error.name : "unknown" }));
      return json({ error: "Internal error" }, 500);
    }
  },
  async queue(batch: MessageBatch<NotificationEvent>, env: RuntimeEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        const event = parseNotification(message.body);
        if (!event) {
          // An invalid internal queue payload is not deliverable; acknowledge to avoid retry storms.
          message.ack();
          continue;
        }
        await deliverNotification(event, env);
        message.ack();
      } catch (error) {
        console.error(JSON.stringify({ event: "notification_callback_failed", id: message.id, kind: error instanceof Error ? error.name : "unknown" }));
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<RuntimeEnv, NotificationEvent>;
