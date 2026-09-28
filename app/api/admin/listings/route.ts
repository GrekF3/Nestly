import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { listingChecks, listings } from "@/db/schema";
import { fail, json, requireRole } from "@/server/api";

const query = z.object({ status: z.enum(["pending", "published", "rejected"]).optional() });
export async function GET(request: Request) {
  try {
    const db = getDb();
    await requireRole(db, request, ["admin", "support"]);
    const { status } = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const items = await db.select().from(listings).where(status ? eq(listings.status, status) : undefined).orderBy(desc(listings.createdAt)).limit(100);
    const checks = items.length ? await db.select().from(listingChecks).where(inArray(listingChecks.listingId, items.map((item) => item.id))) : [];
    return json({ items: items.map((item) => ({ ...item, checks: checks.filter((check) => check.listingId === item.id) })) });
  } catch (error) { return fail(error); }
}
