import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { listingChecks, listings, paymentIntents } from "@/db/schema";
import { ApiError, body, digest, fail, json, requireUser, runtimeEnv, safeMutation } from "@/server/api";
import { operationRequest, operationsTenantId } from "@/server/operations";
import type { MockPaymentIntent } from "@/packages/shared/worker-contract";

const schema = z.object({ listingId: z.string().uuid() });
export async function POST(request: Request) {
  try {
    safeMutation(request);
    if (runtimeEnv().PAYMENTS_MODE !== "mock") throw new ApiError(503, "Mock payments unavailable");
    const db = getDb();
    const user = await requireUser(db, request);
    const input = await body(request, schema);
    const requestedKey = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestedKey)) throw new ApiError(400, "Valid Idempotency-Key required");
    const [listing] = await db.select().from(listings).where(and(eq(listings.id, input.listingId), eq(listings.status, "published"))).limit(1);
    if (!listing) throw new ApiError(404, "Home not found");
    if (listing.ownerId === user.id) throw new ApiError(400, "You cannot pay for your own home");
    const checks = await db.select().from(listingChecks).where(eq(listingChecks.listingId, listing.id));
    if (checks.length !== 4 || !checks.every((check) => check.status === "passed") || listing.oneTimeFeesTHB === null || listing.recurringFeesTHB === null || listing.agentFeeTHB === null) throw new ApiError(409, "Move-in amount is not verified");
    const amountMinor = (listing.monthlyRent * (1 + listing.depositMonths) + listing.oneTimeFeesTHB + listing.agentFeeTHB) * 100;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > 100_000_000) throw new ApiError(400, "Amount outside mock provider range");
    const idempotencyKey = await digest(`${user.id}:${listing.id}:${requestedKey}`);
    const result = await operationRequest<{ intent: MockPaymentIntent; idempotentReplay: boolean }>("POST", "/v1/payment-intents", { tenantId: operationsTenantId(), userId: user.id, listingId: listing.id, amountMinor, currency: "THB" }, idempotencyKey);
    const intent = result.intent;
    if (intent.userId !== user.id || intent.listingId !== listing.id || intent.amountMinor !== amountMinor || intent.currency !== "THB" || intent.provider !== "mock" || intent.liveCharge !== false) throw new ApiError(502, "Mock provider response invalid");
    await db.insert(paymentIntents).values({ id: intent.id, userId: user.id, listingId: listing.id, amountMinor, status: intent.status }).onConflictDoNothing();
    return json({ intent, idempotentReplay: result.idempotentReplay, liveCharge: false }, result.idempotentReplay ? 200 : 201);
  } catch (error) { return fail(error); }
}
