import { eq } from "drizzle-orm";
import { notificationOutbox } from "@/db/schema";
import { ApiError, type AppDb, runtimeEnv } from "./api";

export function operationsTenantId(): string {
  const tenantId = runtimeEnv().YUU_TENANT_ID;
  if (!tenantId || !/^[A-Za-z0-9_-]{1,100}$/.test(tenantId)) throw new ApiError(503, "Operations service unavailable");
  return tenantId;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return [...bytes].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function workerBase(): URL {
  const raw = runtimeEnv().OPERATIONS_WORKER_URL;
  if (!raw) throw new ApiError(503, "Operations service unavailable");
  const url = new URL(raw);
  if (url.search || url.hash || (url.protocol !== "https:" && !(runtimeEnv().APP_ENV === "development" && url.hostname === "127.0.0.1"))) throw new ApiError(503, "Operations service unavailable");
  return url;
}
export async function operationRequest<T>(method: "POST" | "GET", pathname: string, payload?: unknown, idempotencyKey = ""): Promise<T> {
  const secret = runtimeEnv().INTERNAL_HMAC_SECRET;
  if (!secret || secret.length < 32) throw new ApiError(503, "Operations service unavailable");
  const base = workerBase();
  const url = new URL(pathname, base);
  if (url.origin !== base.origin || !pathname.startsWith("/v1/") || url.search) throw new ApiError(500, "Invalid operations path");
  const rawBody = payload === undefined ? "" : JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmac(secret, `${timestamp}.${method}.${url.pathname}.${idempotencyKey}.${rawBody}`);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { "X-Yuu-Timestamp": String(timestamp), "X-Yuu-Signature": `v1=${signature}`, ...(payload === undefined ? {} : { "Content-Type": "application/json" }), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      body: method === "POST" ? rawBody : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ApiError(503, "Operations service unavailable"); }
  if (!response.ok) throw new ApiError(response.status >= 500 ? 503 : response.status, "Operations service rejected request");
  return await response.json() as T;
}

export async function mockProviderEvent(payload: { eventId: string; intentId: string; tenantId: string; status: "succeeded" | "failed" | "canceled" }) {
  const env = runtimeEnv();
  if (env.PAYMENTS_MODE !== "mock" || !env.MOCK_PROVIDER_HMAC_SECRET || env.MOCK_PROVIDER_HMAC_SECRET.length < 32) throw new ApiError(503, "Mock payments unavailable");
  const base = workerBase();
  const pathname = "/v1/mock-webhooks/payments";
  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmac(env.MOCK_PROVIDER_HMAC_SECRET, `${timestamp}.POST.${pathname}..${rawBody}`);
  let response: Response;
  try {
    response = await fetch(new URL(pathname, base), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Yuu-Timestamp": String(timestamp), "X-Yuu-Signature": `v1=${signature}` },
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    });
  } catch { throw new ApiError(503, "Mock payments unavailable"); }
  if (!response.ok) throw new ApiError(response.status >= 500 ? 503 : response.status, "Mock payment transition rejected");
  return response.json();
}

export async function queueNotification(db: AppDb, type: "support.ticket.created" | "verification.requested", subjectId: string): Promise<"queued" | "pending"> {
  const eventId = crypto.randomUUID();
  await db.insert(notificationOutbox).values({ id: eventId, type, subjectId });
  try {
    const result = await operationRequest<{ status: string }>("POST", "/v1/notifications", { eventId, type, tenantId: operationsTenantId(), subjectId, occurredAt: Date.now() });
    if (result.status !== "queued") return "pending";
    await db.update(notificationOutbox).set({ deliveredAt: new Date().toISOString() }).where(eq(notificationOutbox.id, eventId));
    return "queued";
  } catch { return "pending"; }
}

export async function verifyWorkerCallback(request: Request, rawBody: string): Promise<boolean> {
  const secret = runtimeEnv().CALLBACK_HMAC_SECRET;
  if (!secret || secret.length < 32) return false;
  const timestampRaw = request.headers.get("x-yuu-timestamp");
  const signature = request.headers.get("x-yuu-signature");
  if (!timestampRaw || !/^\d{10,12}$/.test(timestampRaw) || !signature || !/^v1=[0-9a-f]{64}$/.test(signature)) return false;
  const timestamp = Number(timestampRaw);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = `v1=${await hmac(secret, `${timestamp}.${request.method}.${new URL(request.url).pathname}..${rawBody}`)}`;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
