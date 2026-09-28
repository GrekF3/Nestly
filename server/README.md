# YUU backend integration

The Next route handlers in `app/api` run server-side with Cloudflare D1 (`DB`) and R2 (`BUCKET`). Business validation and session/security helpers are in `server/`. The operations Worker in `workers/yuu-operations` is a separate service for mock payments and notification transport. The API route process is not yet deployed as a separately scaled backend Worker; that extraction remains required for complete frontend/backend/worker runtime separation.

## Required bindings and secrets

- `DB`: D1 database; apply all SQL files in `drizzle/` in journal order.
- `BUCKET`: private R2 bucket for listing photos.
- `APP_ENV`: `production` or `development`.
- `OTP_PEPPER`: random secret of at least 32 characters, kept outside Git.
- `SMS_API_URL` (HTTPS) and `SMS_API_TOKEN`: provider endpoint/token for OTP. The endpoint must accept JSON `{to,message}` with a Bearer token. Without either, OTP returns 503 in production.
- Local OTP only: `APP_ENV=development` plus `ALLOW_MOCK_SMS=true`. This is the sole mode where `/api/auth/phone/start` returns `mockCode`.
- `OPERATIONS_WORKER_URL`: HTTPS origin of the separate operations Worker.
- `INTERNAL_HMAC_SECRET`, `CALLBACK_HMAC_SECRET`, `MOCK_PROVIDER_HMAC_SECRET`: distinct random secrets of at least 32 characters; match Worker secrets.
- `YUU_TENANT_ID`: a stable opaque tenant identifier, e.g. `yuu_thailand`.
- `PAYMENTS_MODE=mock`: permits mock payment intents and the user-triggered simulation endpoint. No card details are accepted or stored.
- Worker `BACKEND_CALLBACK_URL`: full HTTPS URL to `/api/internal/worker/events`.

Do not put secrets in `.openai/hosting.json` or commit `.dev.vars`. Configure them as deployment secrets. Bind `DB` and `BUCKET` before exposing owner, auth or admin flows. Both services fail closed when their required bindings or secrets are absent.

## Authentication and roles

`POST /api/auth/register` `{email,password,name}` (password 12–128 chars), `POST /api/auth/login` `{email,password}`, `POST /api/auth/logout`, `GET /api/auth/me`. Register/login set an opaque 30-day `HttpOnly; SameSite=Lax` session cookie with `Secure` on HTTPS. The database stores only the SHA-256 token digest. Passwords use PBKDF2-SHA256 with a per-user random salt and 310,000 iterations. All browser mutations require an exact same-origin `Origin` header. Login and OTP have D1-backed rate limits.

`POST /api/auth/phone/start` `{phone:"+1 555 010 0000"}` sends a six-digit OTP or returns 503 if SMS is unavailable. `POST /api/auth/phone/verify` `{phone,code}` creates/links a session. A successful OTP sets `phoneVerifiedAt`; it does **not** set the admin identity-verified flag. Public user fields are `{id,email,phone,phoneVerifiedAt,name,role,verified}`. Email verification and password reset are not yet implemented.

The first admin requires a reviewed, manually provisioned account. After registering the exact account and verifying identity out of band, an operator with D1 access can run `UPDATE users SET role = 'admin' WHERE id = '<reviewed UUID>';`. Check that exactly one row changed. There is no public bootstrap or role self-promotion endpoint. Admin can subsequently use `PATCH /api/admin/users/:id`.

## Listings, verification and price

`GET /api/listings` returns `{items,nextCursor}` (max 50) and accepts `city`, `minRent`, `maxRent`, `bedrooms`, `propertyType`, `availableBy` (YYYY-MM-DD), `minLeaseMonths`, `nearTransit=true`, and a full bounding box `south,west,north,east`. Bbox is applied to coordinates rounded to 0.01 degree. Public listing JSON omits owner ID and exact location; coordinates are rounded. `GET /api/listings/:id` returns `{listing}` for published records only.

Authenticated owner flow: `POST /api/media/upload` with raw JPEG/PNG/WebP body up to 10 MiB returns `{id,url,mimeType,sizeBytes}`; `GET /api/media/:id` serves it to the owner/admin until the listing is published, then publicly. `POST /api/owner/listings` accepts `listingInput` in `server/validation.ts`, including an array of owned `/api/media/:id` URLs, and returns `{listing,notificationStatus}`. `GET /api/owner/listings` returns own listings. Owner submissions start pending.

Images containing common EXIF/XMP/text metadata are rejected to avoid leaking a home's exact location. The client should re-encode selected photos without metadata before upload; the backend validates this independently. Video storage and transcoding are not yet implemented.

Admin review: `GET /api/admin/listings?status=pending` includes per-listing checks. `GET /api/admin/listings/:id/checks` returns `{checks,cost}`. `PATCH /api/admin/listings/:id/cost` with all three integer THB fees `{oneTimeFeesTHB,recurringFeesTHB,agentFeeTHB}` resets the lease check and unpublishes. `PATCH /api/admin/listings/:id/checks` `{kind,status,publicNote?}` reviews identity, ownership, media or lease. Any failed/pending check unpublishes. `PATCH /api/admin/listings/:id` `{status,rejectionReason?}` can publish only after all four checks pass, at least one photo is present, and every fee is confirmed. Public `GET /api/listings/:id/trust` returns per-check status and a server-calculated move-in ledger. `moveInTotalTHB` is null until costs are reviewed. `verified` is true only when all four checks passed on a published listing.

`POST /api/viewings` `{listingId,requestedAt,notes?}` requires a session, a published listing and a future time within 60 days. `GET /api/viewings` returns own requests.

## Mock payments and support

`POST /api/payments/intents` requires `{listingId}` and an `Idempotency-Key` header (16–128 allowed characters). It computes the confirmed move-in amount server-side in satang; the browser never supplies the amount. `GET /api/payments/intents/:id` refreshes the status from the operations Worker. `POST /api/payments/intents/:id/simulate` `{status:"succeeded"|"failed"|"canceled"}` drives only a mock intent owned by the current user. Responses always include `liveCharge:false`. If the Worker is absent, these routes return 503. A `pending` intent is not paid.

Authenticated `POST /api/support/tickets` `{subject,message}` returns `{ticket,notificationStatus}`. `notificationStatus:"pending"` means the operations Worker did not accept the event; the ticket still exists. `GET /api/support/tickets` returns own tickets, or all tickets to support/admin. `GET /api/support/tickets/:id/messages` and `POST` with `{message}` provide the conversation. Support/admin can change status with `PATCH /api/support/tickets/:id` `{status}`. `POST /api/admin/notifications/retry` retries up to 20 pending outbox entries. Worker callbacks are HMAC-verified and deduplicated by event ID at `/api/internal/worker/events`.

This is an asynchronous support inbox. It does not by itself guarantee a human response 24/7, SMS/email delivery, or a customer-facing live chat SLA.

## Security verification scenarios

Against a local build with D1 migrations and development secrets configured:

1. Register and inspect `Set-Cookie`: `HttpOnly`, `SameSite=Lax`, and `Secure` on HTTPS. `GET /api/auth/me` with the cookie returns the user; without it returns null. Expire the D1 `sessions.expires_at` row and verify `/api/auth/me` returns null.
2. POST JSON with no `Origin` or a foreign `Origin` to each mutation route; expect 403. Use the exact local origin for successful requests.
3. Request OTP repeatedly: the fourth request per phone in 15 minutes returns 429. Five wrong codes invalidate a challenge; a used correct code cannot be replayed. Without SMS configuration outside explicit development mock mode, start returns 503 and no `mockCode`.
4. As a renter, request `/api/admin/users` and patch a listing check; expect 403. As owner A, request owner B's private media URL; expect 404.
5. Submit a listing with an uploaded image and explicit fees. Attempt publish before all four checks pass: 409. Pass each check as admin, then publish: 200. Change a passed check back to pending: public GET becomes 404 and the listing returns to pending.
6. Submit a viewing for a pending/other owner's listing or a date in the past: expect 404/400. A signed in renter requesting a published listing gets 201.
7. Create a mock intent with the same key twice: same intent ID and `idempotentReplay:true` on retry. Omit operations secrets: expect 503. Simulate success, then GET status; it must be `succeeded` and `liveCharge:false`. A different user cannot GET or simulate the intent.
8. POST an unsigned, stale, or duplicate Worker callback. Unsigned/stale returns 401; the second correctly signed event returns `duplicate:true`.

Run `npx tsc --noEmit`, `npx eslint app/api server db/schema.ts`, `npm run db:generate`, `npm run build`, and `npm audit --audit-level=high` before deploying. The SQL migrations are append-only; do not change already applied migration files.
