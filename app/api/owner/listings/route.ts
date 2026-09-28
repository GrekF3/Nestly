import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { listingChecks, listings, mediaAssets, users } from "@/db/schema";
import { ApiError } from "@/server/api";
import { body, fail, json, requireUser, safeMutation } from "@/server/api";
import { listingInput } from "@/server/validation";
import { queueNotification } from "@/server/operations";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const user = await requireUser(db, request);
    const items = await db.select().from(listings).where(eq(listings.ownerId, user.id)).orderBy(desc(listings.createdAt)).limit(100);
    return json({ items });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    const user = await requireUser(db, request);
    const input = await body(request, listingInput);
    const mediaIds = input.mediaUrls.map((url) => url.slice("/api/media/".length));
    if (new Set(mediaIds).size !== mediaIds.length) throw new ApiError(400, "Duplicate media assets");
    if (mediaIds.length) {
      const assets = await db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds));
      if (assets.length !== mediaIds.length || assets.some((asset) => asset.ownerId !== user.id || asset.listingId !== null)) throw new ApiError(400, "Media assets must belong to you and be unused");
    }
    if (user.role === "renter") await db.update(users).set({ role: "owner" }).where(eq(users.id, user.id));
    const [listing] = await db.insert(listings).values({ ...input, id: crypto.randomUUID(), ownerId: user.id, status: "pending" }).returning();
    if (mediaIds.length) {
      const updated = await db.update(mediaAssets).set({ listingId: listing.id }).where(and(inArray(mediaAssets.id, mediaIds), eq(mediaAssets.ownerId, user.id), isNull(mediaAssets.listingId))).returning();
      if (updated.length !== mediaIds.length) {
        await db.update(mediaAssets).set({ listingId: null }).where(eq(mediaAssets.listingId, listing.id));
        await db.delete(listings).where(eq(listings.id, listing.id));
        throw new ApiError(409, "Media assets changed; retry submission");
      }
    }
    await db.insert(listingChecks).values((["identity", "ownership", "media", "lease"] as const).map((kind) => ({ id: crypto.randomUUID(), listingId: listing.id, kind })));
    const notificationStatus = await queueNotification(db, "verification.requested", listing.id);
    return json({ listing, notificationStatus }, 201);
  } catch (error) { return fail(error); }
}
