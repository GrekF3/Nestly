# YUU operations Worker

Separate Cloudflare Worker for two backend-only capabilities: queued support/verification events and a **mock-only** payment intent provider. No route charges cards, moves money, or stores payment credentials. The browser must call the YUU backend, never this Worker directly.

## Contract

All `/v1` requests require `X-Yuu-Timestamp` (Unix seconds) and `X-Yuu-Signature` (`v1=` plus lowercase HMAC-SHA256 hex). Sign the exact UTF-8 request body, HTTP method, pathname, and optional `Idempotency-Key`:

```
HMAC_SHA256(secret, `${timestamp}.${METHOD}.${pathname}.${idempotencyKey || ""}.${rawBody}`)
```

The Worker rejects signatures older/newer than five minutes, malformed signatures, query strings, and bodies above 16 KiB. Use `INTERNAL_HMAC_SECRET` for backend calls. The mock webhook route uses the separate `MOCK_PROVIDER_HMAC_SECRET`. All secrets must be at least 32 random bytes. Rotate them together with backend configuration; old signatures stop working immediately.

### Mock payment intents

`POST /v1/payment-intents`, signed with the internal secret and an `Idempotency-Key` of 16–128 ASCII letters, digits, `_`, or `-`:

```json
{"tenantId":"tenant_1","userId":"user_1","listingId":"listing_1","amountMinor":4200000,"currency":"THB"}
```

Amount is integer satang (`amountMinor`), from 100 to 100,000,000. Response is `201 {"intent": ..., "idempotentReplay": false}`. Same key and body returns `200` and the same intent. Same key with changed fields returns `409`. The intent ID is deterministic for tenant + key, with a secret keyed hash, so it can be retrieved without a mutable cross-object index.

`GET /v1/tenants/:tenantId/payment-intents/:intentId` is signed with an empty body and returns the mock intent. An unknown or different-tenant intent returns `404`.

`POST /v1/mock-webhooks/payments` is signed with the provider secret:

```json
{"eventId":"event_123","intentId":"mpi_...","tenantId":"tenant_1","status":"succeeded"}
```

`status` may be `succeeded`, `failed`, or `canceled`. Only `pending → terminal` is permitted. Repeating the same `eventId` returns `200` with `duplicate: true`; a different event after a terminal status returns `409`. This endpoint is only for the mock provider and test orchestration. Backend can poll the GET endpoint to reconcile status; it should never represent `pending` as paid.

### Support and verification notification handoff

`POST /v1/notifications`, signed with the internal secret:

```json
{"eventId":"event_123","type":"support.ticket.created","tenantId":"tenant_1","subjectId":"ticket_1","occurredAt":1790000000000}
```

The other accepted type is `verification.requested`. The response `202 {"status":"queued"}` proves only persistence to Cloudflare Queue. It does **not** mean an agent was notified, a message was sent, or support is online. Payloads carry opaque IDs only, so the backend callback can fetch current sensitive details under its own authorization rules.

The queue consumer POSTs the same event to `BACKEND_CALLBACK_URL` over HTTPS. It signs the callback with `CALLBACK_HMAC_SECRET` and adds `X-Yuu-Event-Id`. Delivery is at least once: backend must deduplicate by `eventId` and return a 2xx response only after durable acceptance. Non-2xx, timeout, or missing callback configuration triggers retries; after ten retries messages go to `yuu-notifications-dlq` for operations review. This Worker is a transport, not an email/SMS provider or a staffed support system.

## Local verification

From `workers/yuu-operations`:

```bash
npm ci
npm test
npm run check
npm audit --audit-level=high
```

`npm run check` generates Cloudflare binding/runtime types, runs strict TypeScript, and performs a Wrangler dry run. The generated types and local `.dev.vars*` are ignored by Git. Create a local `.dev.vars` with distinct development secrets and callback URL for end-to-end testing.

## Cloudflare deployment

Create the producer queue and its DLQ once in the target account:

```bash
npx wrangler queues create yuu-notifications
npx wrangler queues create yuu-notifications-dlq
```

Set each value as a secret in the Worker project (never commit secret values):

```bash
npx wrangler secret put INTERNAL_HMAC_SECRET --config ./wrangler.jsonc
npx wrangler secret put MOCK_PROVIDER_HMAC_SECRET --config ./wrangler.jsonc
npx wrangler secret put CALLBACK_HMAC_SECRET --config ./wrangler.jsonc
npx wrangler secret put BACKEND_CALLBACK_URL --config ./wrangler.jsonc
```

Then run `npm run check` and `npx wrangler deploy --config ./wrangler.jsonc`. Configure backend to sign requests and verify the outbound callback, and monitor the queue/DLQ. The `workers.dev` URL is exposed for signed backend requests; use a service binding or private route when the main backend and Worker share a Cloudflare account.

Current scope deliberately has no real payment provider, no SMS/email provider, and no guarantee of human response at any hour. Those require provider accounts, operational configuration, and staff routing.
