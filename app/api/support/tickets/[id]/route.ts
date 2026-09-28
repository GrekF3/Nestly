import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditEvents, supportTickets } from "@/db/schema";
import { ApiError, body, fail, json, requireRole, requireUser, safeMutation } from "@/server/api";

const schema = z.object({ status: z.enum(["open", "pending", "resolved"]) });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb();
    const user = await requireUser(db, request);
    const { id } = await context.params;
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!ticket || (ticket.userId !== user.id && user.role !== "support" && user.role !== "admin")) throw new ApiError(404, "Ticket not found");
    return json({ ticket });
  } catch (error) { return fail(error); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    const db = getDb();
    const actor = await requireRole(db, request, ["support", "admin"]);
    const { id } = await context.params;
    const input = await body(request, schema);
    const [ticket] = await db.update(supportTickets).set({ status: input.status, updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, id)).returning();
    if (!ticket) throw new ApiError(404, "Ticket not found");
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: actor.id, action: `ticket.${input.status}`, targetType: "support_ticket", targetId: id, details: {} });
    return json({ ticket });
  } catch (error) { return fail(error); }
}
