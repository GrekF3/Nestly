import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiError, body, clientKey, createSession, fail, json, limit, passwordHash, publicUser, safeMutation } from "@/server/api";
import { email, password } from "@/server/validation";

const schema = z.object({ email, password, name: z.string().trim().min(2).max(80) });
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    await limit(db, `register:${clientKey(request)}`, 5, 3600);
    const input = await body(request, schema);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (exists) throw new ApiError(409, "Email already registered");
    const [user] = await db.insert(users).values({ id: crypto.randomUUID(), email: input.email, name: input.name, passwordHash: await passwordHash(input.password) }).returning();
    return json({ user: publicUser(user) }, 201, { "Set-Cookie": await createSession(db, user.id, request) });
  } catch (error) { return fail(error); }
}
