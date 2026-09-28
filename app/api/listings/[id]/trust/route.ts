import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { listingChecks, listings } from "@/db/schema";
import { ApiError, fail, json } from "@/server/api";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = getDb();
    const [listing] = await db.select().from(listings).where(and(eq(listings.id, id), eq(listings.status, "published"))).limit(1);
    if (!listing) throw new ApiError(404, "Home not found");
    const checks = await db.select({ kind: listingChecks.kind, status: listingChecks.status, publicNote: listingChecks.publicNote, reviewedAt: listingChecks.reviewedAt }).from(listingChecks).where(eq(listingChecks.listingId, id));
    const verified = checks.length === 4 && checks.every((check) => check.status === "passed");
    const leaseCheckPassed = checks.some((check) => check.kind === "lease" && check.status === "passed");
    const allFeesConfirmed = leaseCheckPassed && listing.oneTimeFeesTHB !== null && listing.recurringFeesTHB !== null && listing.agentFeeTHB !== null;
    const depositTHB = listing.monthlyRent * listing.depositMonths;
    const knownMoveInSubtotalTHB = listing.monthlyRent + depositTHB + (listing.oneTimeFeesTHB ?? 0) + (listing.agentFeeTHB ?? 0);
    return json({
      listingId: id,
      checks,
      verified,
      cost: {
        monthlyRent: listing.monthlyRent,
        depositMonths: listing.depositMonths,
        depositTHB,
        oneTimeFeesTHB: listing.oneTimeFeesTHB,
        recurringFeesTHB: listing.recurringFeesTHB,
        agentFeeTHB: listing.agentFeeTHB,
        knownMoveInSubtotalTHB,
        moveInTotalTHB: allFeesConfirmed ? knownMoveInSubtotalTHB : null,
        allFeesConfirmed,
      },
    });
  } catch (error) { return fail(error); }
}
