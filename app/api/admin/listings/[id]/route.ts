import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditEvents, listingChecks, listings } from "@/db/schema";
import { ApiError, body, fail, json, requireRole, safeMutation } from "@/server/api";

const schema = z.object({ status: z.enum(["pending", "published", "rejected"]), rejectionReason: z.string().trim().max(1000).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    const db = getDb();
    const actor = await requireRole(db, request, ["admin"]);
    const { id } = await context.params;
    const input = await body(request, schema);
    if (input.status === "rejected" && !input.rejectionReason) throw new ApiError(400, "Rejection reason required");
    if (input.status === "published") {
      const [candidate] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
      if (!candidate) throw new ApiError(404, "Home not found");
      const allChecks = await db.select().from(listingChecks).where(eq(listingChecks.listingId, id));
      if (candidate.mediaUrls.length === 0 || candidate.oneTimeFeesTHB === null || candidate.recurringFeesTHB === null || candidate.agentFeeTHB === null || allChecks.length !== 4 || !allChecks.every((check) => check.status === "passed")) {
        throw new ApiError(409, "Confirm every fee and pass all four home checks before publishing");
      }
    }
    const [listing] = await db.update(listings).set({ status: input.status, rejectionReason: input.status === "rejected" ? input.rejectionReason : null, updatedAt: new Date().toISOString() }).where(eq(listings.id, id)).returning();
    if (!listing) throw new ApiError(404, "Home not found");
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: actor.id, action: `listing.${input.status}`, targetType: "listing", targetId: id, details: { reason: input.rejectionReason ?? null } });
    return json({ listing });
  } catch (error) { return fail(error); }
}
