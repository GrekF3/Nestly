import { and, asc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { listings } from "@/db/schema";
import { fail, json } from "@/server/api";
import { publicListing } from "@/server/listings";

const query = z.object({
  city: z.string().trim().min(1).max(80).optional(),
  minRent: z.coerce.number().int().min(0).max(2_000_000).optional(),
  maxRent: z.coerce.number().int().min(0).max(2_000_000).optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  propertyType: z.enum(["condo", "apartment", "house"]).optional(),
  availableBy: z.iso.date().optional(),
  minLeaseMonths: z.coerce.number().int().min(1).max(60).optional(),
  nearTransit: z.enum(["true", "false"]).optional(),
  south: z.coerce.number().min(-90).max(90).optional(),
  west: z.coerce.number().min(-180).max(180).optional(),
  north: z.coerce.number().min(-90).max(90).optional(),
  east: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
}).refine((value) => {
  const bbox = [value.south, value.west, value.north, value.east];
  if (bbox.every((item) => item === undefined)) return true;
  return bbox.every((item) => item !== undefined) && value.south! < value.north! && value.west! < value.east!;
}, "Provide a valid south/west/north/east bounding box");
export async function GET(request: Request) {
  try {
    const params = query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = getDb();
    const predicates = [eq(listings.status, "published")];
    if (params.city) predicates.push(eq(listings.city, params.city));
    if (params.minRent !== undefined) predicates.push(gte(listings.monthlyRent, params.minRent));
    if (params.maxRent !== undefined) predicates.push(lte(listings.monthlyRent, params.maxRent));
    if (params.bedrooms !== undefined) predicates.push(eq(listings.bedrooms, params.bedrooms));
    if (params.propertyType) predicates.push(eq(listings.propertyType, params.propertyType));
    if (params.availableBy) predicates.push(lte(listings.availableFrom, params.availableBy));
    if (params.minLeaseMonths !== undefined) predicates.push(lte(listings.minimumLeaseMonths, params.minLeaseMonths));
    if (params.nearTransit === "true") predicates.push(lte(listings.transitWalkMinutes, 15));
    if (params.south !== undefined && params.north !== undefined && params.west !== undefined && params.east !== undefined) {
      predicates.push(sql`round(${listings.lat}, 2) >= ${params.south} and round(${listings.lat}, 2) <= ${params.north} and round(${listings.lng}, 2) >= ${params.west} and round(${listings.lng}, 2) <= ${params.east}`);
    }
    if (params.cursor) predicates.push(gt(listings.id, params.cursor));
    const rows = await db.select().from(listings).where(and(...predicates)).orderBy(asc(listings.id)).limit(params.limit + 1);
    const hasMore = rows.length > params.limit;
    const items = rows.slice(0, params.limit).map(publicListing);
    return json({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
  } catch (error) { return fail(error); }
}
