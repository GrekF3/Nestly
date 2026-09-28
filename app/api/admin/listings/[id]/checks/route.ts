import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditEvents, listingChecks, listings } from "@/db/schema";
import { ApiError, body, fail, json, requireRole, safeMutation } from "@/server/api";

const schema = z.object({ kind: z.enum(["identity", "ownership", "media", "lease"]), status: z.enum(["pending", "passed", "failed"]), publicNote: z.string().trim().max(500).default("") });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    await requireRole(db, request, ["admin", "support"]);
    const { id } = await context.params;
    const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
    if (!listing) throw new ApiError(404, "Home not found");
    const checks = await db.select().from(listingChecks).where(eq(listingChecks.listingId, id));
    return json({ checks, cost: { monthlyRent: listing.monthlyRent, depositMonths: listing.depositMonths, oneTimeFeesTHB: listing.oneTimeFeesTHB, recurringFeesTHB: listing.recurringFeesTHB, agentFeeTHB: listing.agentFeeTHB } });
  } catch (error) { return fail(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    const db = getDb();
    const actor = await requireRole(db, request, ["admin"]);
    const { id } = await context.params;
    const input = await body(request, schema);
    const [listing] = await db.select({ id: listings.id }).from(listings).where(eq(listings.id, id)).limit(1);
    if (!listing) throw new ApiError(404, "Home not found");
    const [check] = await db.insert(listingChecks).values({ id: crypto.randomUUID(), listingId: id, ...input, reviewedAt: new Date().toISOString(), reviewedBy: actor.id }).onConflictDoUpdate({ target: [listingChecks.listingId, listingChecks.kind], set: { status: input.status, publicNote: input.publicNote, reviewedAt: new Date().toISOString(), reviewedBy: actor.id } }).returning();
    const checks = await db.select().from(listingChecks).where(eq(listingChecks.listingId, id));
    const allPassed = checks.length === 4 && checks.every((item) => item.status === "passed");
    await db.update(listings).set({ verificationStatus: allPassed ? "verified" : "unverified", ...(allPassed ? {} : { status: "pending" as const }), updatedAt: new Date().toISOString() }).where(eq(listings.id, id));
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: actor.id, action: `check.${input.kind}.${input.status}`, targetType: "listing", targetId: id, details: { publicNote: input.publicNote } });
    return json({ check, verified: allPassed, unpublished: !allPassed });
  } catch (error) { return fail(error); }
}
