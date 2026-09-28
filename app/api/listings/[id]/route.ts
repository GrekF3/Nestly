import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { ApiError, fail, json } from "@/server/api";
import { publicListing } from "@/server/listings";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const [row] = await getDb().select().from(listings).where(and(eq(listings.id, id), eq(listings.status, "published"))).limit(1);
    if (!row) throw new ApiError(404, "Home not found");
    return json({ listing: publicListing(row) });
  } catch (error) { return fail(error); }
}
