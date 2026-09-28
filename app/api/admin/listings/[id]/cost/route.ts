import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditEvents, listingChecks, listings } from "@/db/schema";
import { ApiError, body, fail, json, requireRole, safeMutation } from "@/server/api";

const fee = z.number().int().min(0).max(1_000_000);
const schema = z.object({ oneTimeFeesTHB: fee, recurringFeesTHB: fee, agentFeeTHB: fee });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    const db = getDb();
    const actor = await requireRole(db, request, ["admin"]);
    const { id } = await context.params;
    const input = await body(request, schema);
    const [listing] = await db.update(listings).set({ ...input, status: "pending", verificationStatus: "unverified", updatedAt: new Date().toISOString() }).where(eq(listings.id, id)).returning();
    if (!listing) throw new ApiError(404, "Home not found");
    await db.update(listingChecks).set({ status: "pending", reviewedAt: null, reviewedBy: null }).where(and(eq(listingChecks.listingId, id), eq(listingChecks.kind, "lease")));
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: actor.id, action: "listing.cost_updated", targetType: "listing", targetId: id, details: input });
    return json({ listing });
  } catch (error) { return fail(error); }
}
