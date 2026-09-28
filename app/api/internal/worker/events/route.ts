import { z } from "zod";
import { getDb } from "@/db";
import { inboundWorkerEvents } from "@/db/schema";
import { fail, json, readCappedBody } from "@/server/api";
import { operationsTenantId, verifyWorkerCallback } from "@/server/operations";

const schema = z.object({
  eventId: z.string().uuid(),
  type: z.enum(["support.ticket.created", "verification.requested"]),
  tenantId: z.string().min(1).max(100),
  subjectId: z.string().uuid(),
  occurredAt: z.number().int().positive(),
});
export async function POST(request: Request) {
  try {
    const rawBody = await readCappedBody(request, 16_384);
    if (!await verifyWorkerCallback(request, rawBody)) return json({ error: "Invalid signature" }, 401);
    const event = schema.parse(JSON.parse(rawBody));
    if (request.headers.get("x-yuu-event-id") !== event.eventId || event.tenantId !== operationsTenantId()) return json({ error: "Invalid event" }, 400);
    const [inserted] = await getDb().insert(inboundWorkerEvents).values({ eventId: event.eventId, type: event.type, subjectId: event.subjectId }).onConflictDoNothing().returning();
    return json({ accepted: true, duplicate: !inserted });
  } catch (error) { return fail(error); }
}
