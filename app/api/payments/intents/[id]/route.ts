import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { paymentIntents } from "@/db/schema";
import { ApiError, fail, json, requireUser, runtimeEnv } from "@/server/api";
import { operationRequest, operationsTenantId } from "@/server/operations";
import type { MockPaymentIntent } from "@/packages/shared/worker-contract";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (runtimeEnv().PAYMENTS_MODE !== "mock") throw new ApiError(503, "Mock payments unavailable");
    const db = getDb();
    const user = await requireUser(db, request);
    const { id } = await context.params;
    const [local] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, id), eq(paymentIntents.userId, user.id))).limit(1);
    if (!local) throw new ApiError(404, "Intent not found");
    const result = await operationRequest<{ intent: MockPaymentIntent }>("GET", `/v1/tenants/${operationsTenantId()}/payment-intents/${id}`);
    if (result.intent.id !== id || result.intent.userId !== user.id || result.intent.listingId !== local.listingId || result.intent.amountMinor !== local.amountMinor || result.intent.liveCharge !== false) throw new ApiError(502, "Mock provider response invalid");
    await db.update(paymentIntents).set({ status: result.intent.status, updatedAt: new Date().toISOString() }).where(eq(paymentIntents.id, id));
    return json({ intent: result.intent, liveCharge: false });
  } catch (error) { return fail(error); }
}
