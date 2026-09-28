import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { paymentIntents } from "@/db/schema";
import { ApiError, body, fail, json, requireUser, runtimeEnv, safeMutation } from "@/server/api";
import { mockProviderEvent, operationsTenantId, operationRequest } from "@/server/operations";
import type { MockPaymentIntent } from "@/packages/shared/worker-contract";

const schema = z.object({ status: z.enum(["succeeded", "failed", "canceled"]) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    if (runtimeEnv().PAYMENTS_MODE !== "mock") throw new ApiError(503, "Mock payments unavailable");
    const db = getDb();
    const user = await requireUser(db, request);
    const { id } = await context.params;
    const input = await body(request, schema);
    const [local] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, id), eq(paymentIntents.userId, user.id))).limit(1);
    if (!local) throw new ApiError(404, "Intent not found");
    if (local.status !== "pending") throw new ApiError(409, "Intent already completed");
    await mockProviderEvent({ eventId: crypto.randomUUID(), intentId: id, tenantId: operationsTenantId(), status: input.status });
    const result = await operationRequest<{ intent: MockPaymentIntent }>("GET", `/v1/tenants/${operationsTenantId()}/payment-intents/${id}`);
    if (result.intent.id !== id || result.intent.userId !== user.id || result.intent.status !== input.status) throw new ApiError(502, "Mock provider response invalid");
    await db.update(paymentIntents).set({ status: result.intent.status, updatedAt: new Date().toISOString() }).where(eq(paymentIntents.id, id));
    return json({ intent: result.intent, liveCharge: false });
  } catch (error) { return fail(error); }
}
