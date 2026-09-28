import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditEvents, users } from "@/db/schema";
import { ApiError, body, fail, json, publicUser, requireRole, safeMutation } from "@/server/api";

const schema = z.object({ role: z.enum(["renter", "owner", "support", "admin"]).optional(), verified: z.boolean().optional() }).refine((value) => value.role !== undefined || value.verified !== undefined);
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    safeMutation(request);
    const db = getDb();
    const actor = await requireRole(db, request, ["admin"]);
    const { id } = await context.params;
    const input = await body(request, schema);
    if (id === actor.id && input.role && input.role !== "admin") throw new ApiError(400, "You cannot remove your own admin role");
    const [user] = await db.update(users).set(input).where(eq(users.id, id)).returning();
    if (!user) throw new ApiError(404, "User not found");
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorId: actor.id, action: "user.updated", targetType: "user", targetId: id, details: input });
    return json({ user: publicUser(user) });
  } catch (error) { return fail(error); }
}
