import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { supportMessages, supportTickets } from "@/db/schema";
import { ApiError, body, fail, json, requireUser, safeMutation } from "@/server/api";

const schema = z.object({ message: z.string().trim().min(1).max(5000) });
async function authorize(db: ReturnType<typeof getDb>, request: Request, id: string) {
  const user = await requireUser(db, request);
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  if (!ticket || (ticket.userId !== user.id && user.role !== "support" && user.role !== "admin")) throw new ApiError(404, "Ticket not found");
  return { user, ticket };
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const db = getDb();
    await authorize(db, request, id);
    const items = await db.select().from(supportMessages).where(eq(supportMessages.ticketId, id)).orderBy(asc(supportMessages.createdAt)).limit(200);
    return json({ items });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    const { id } = await context.params;
    const db = getDb();
    const { user, ticket } = await authorize(db, request, id);
    if (ticket.status === "resolved") throw new ApiError(409, "Ticket is closed");
    const input = await body(request, schema);
    const [message] = await db.insert(supportMessages).values({ id: crypto.randomUUID(), ticketId: id, authorId: user.id, body: input.message }).returning();
    await db.update(supportTickets).set({ status: user.role === "support" || user.role === "admin" ? "pending" : "open", updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, id));
    return json({ message }, 201);
  } catch (error) { return fail(error); }
}
