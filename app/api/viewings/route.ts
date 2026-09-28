import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { listings, viewings } from "@/db/schema";
import { ApiError, body, fail, json, requireUser, safeMutation } from "@/server/api";
import { viewingInput } from "@/server/validation";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const user = await requireUser(db, request);
    const items = await db.select().from(viewings).where(eq(viewings.renterId, user.id)).orderBy(desc(viewings.createdAt)).limit(100);
    return json({ items });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    const user = await requireUser(db, request);
    const input = await body(request, viewingInput);
    const [listing] = await db.select({ id: listings.id, ownerId: listings.ownerId }).from(listings).where(and(eq(listings.id, input.listingId), eq(listings.status, "published"))).limit(1);
    if (!listing) throw new ApiError(404, "Home not found");
    if (listing.ownerId === user.id) throw new ApiError(400, "You cannot view your own home");
    const [viewing] = await db.insert(viewings).values({ ...input, id: crypto.randomUUID(), renterId: user.id }).returning();
    return json({ viewing }, 201);
  } catch (error) { return fail(error); }
}
