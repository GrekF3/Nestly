import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { supportMessages, supportTickets } from "@/db/schema";
import { body, fail, json, requireUser, safeMutation } from "@/server/api";
import { queueNotification } from "@/server/operations";

const schema = z.object({ subject: z.string().trim().min(5).max(160), message: z.string().trim().min(10).max(5000) });
export async function GET(request: Request) {
  try {
    const db = getDb();
    const user = await requireUser(db, request);
    const items = await db.select().from(supportTickets).where(user.role === "support" || user.role === "admin" ? undefined : eq(supportTickets.userId, user.id)).orderBy(desc(supportTickets.createdAt)).limit(100);
    return json({ items });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    const user = await requireUser(db, request);
    const input = await body(request, schema);
    const [ticket] = await db.insert(supportTickets).values({ id: crypto.randomUUID(), userId: user.id, subject: input.subject }).returning();
    await db.insert(supportMessages).values({ id: crypto.randomUUID(), ticketId: ticket.id, authorId: user.id, body: input.message });
    const notificationStatus = await queueNotification(db, "support.ticket.created", ticket.id);
    return json({ ticket, notificationStatus }, 201);
  } catch (error) { return fail(error); }
}
