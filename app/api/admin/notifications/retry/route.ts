import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationOutbox } from "@/db/schema";
import { fail, json, requireRole, safeMutation } from "@/server/api";
import { operationRequest, operationsTenantId } from "@/server/operations";

export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    await requireRole(db, request, ["admin"]);
    const rows = await db.select().from(notificationOutbox).where(isNull(notificationOutbox.deliveredAt)).orderBy(asc(notificationOutbox.createdAt)).limit(20);
    let queued = 0;
    for (const row of rows) {
      try {
        const result = await operationRequest<{ status: string }>("POST", "/v1/notifications", { eventId: row.id, type: row.type, tenantId: operationsTenantId(), subjectId: row.subjectId, occurredAt: Date.parse(row.createdAt) });
        if (result.status === "queued") {
          await db.update(notificationOutbox).set({ deliveredAt: new Date().toISOString() }).where(eq(notificationOutbox.id, row.id));
          queued++;
        }
      } catch { /* Remains pending for the next retry. */ }
    }
    return json({ attempted: rows.length, queued, pending: rows.length - queued });
  } catch (error) { return fail(error); }
}
