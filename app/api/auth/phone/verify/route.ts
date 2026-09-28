import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { phoneCodes, users } from "@/db/schema";
import { ApiError, body, clientKey, createSession, currentUser, fail, json, limit, publicUser, safeMutation } from "@/server/api";
import { constantTimeEqual, phoneCodeHash } from "@/server/phone";
import { phone } from "@/server/validation";

const schema = z.object({ phone, code: z.string().regex(/^\d{6}$/) });
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    await limit(db, `sms-verify:${clientKey(request)}`, 20, 900);
    const input = await body(request, schema);
    const now = Math.floor(Date.now() / 1000);
    const [challenge] = await db.select().from(phoneCodes).where(and(eq(phoneCodes.phone, input.phone), gt(phoneCodes.expiresAt, now), isNull(phoneCodes.usedAt), lt(phoneCodes.attempts, 5))).orderBy(desc(phoneCodes.createdAt)).limit(1);
    if (!challenge) throw new ApiError(401, "Invalid or expired code");
    const [attempt] = await db.update(phoneCodes).set({ attempts: sql`${phoneCodes.attempts} + 1` }).where(and(eq(phoneCodes.id, challenge.id), lt(phoneCodes.attempts, 5), isNull(phoneCodes.usedAt))).returning();
    if (!attempt) throw new ApiError(401, "Invalid or expired code");
    if (!constantTimeEqual(await phoneCodeHash(input.phone, challenge.id, input.code), challenge.codeHash)) throw new ApiError(401, "Invalid or expired code");
    const [consumed] = await db.update(phoneCodes).set({ usedAt: now }).where(and(eq(phoneCodes.id, challenge.id), isNull(phoneCodes.usedAt))).returning();
    if (!consumed) throw new ApiError(401, "Invalid or expired code");
    const existing = await currentUser(db, request);
    const [phoneOwner] = await db.select().from(users).where(eq(users.phone, input.phone)).limit(1);
    if (existing && phoneOwner && phoneOwner.id !== existing.id) throw new ApiError(409, "Phone belongs to another account");
    let user = existing ?? phoneOwner;
    if (user && existing) [user] = await db.update(users).set({ phone: input.phone, phoneVerifiedAt: new Date().toISOString() }).where(eq(users.id, existing.id)).returning();
    if (!user) [user] = await db.insert(users).values({ id: crypto.randomUUID(), phone: input.phone, name: "YUU member", phoneVerifiedAt: new Date().toISOString() }).returning();
    return json({ user: publicUser(user) }, 200, { "Set-Cookie": await createSession(db, user.id, request) });
  } catch (error) { return fail(error); }
}
