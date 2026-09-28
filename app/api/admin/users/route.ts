import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { fail, json, publicUser, requireRole } from "@/server/api";

export async function GET(request: Request) {
  try {
    const db = getDb();
    await requireRole(db, request, ["admin"]);
    const items = await db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
    return json({ items: items.map(publicUser) });
  } catch (error) { return fail(error); }
}
