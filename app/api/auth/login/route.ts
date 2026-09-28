import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ApiError, body, clientKey, createSession, fail, json, limit, publicUser, safeMutation, verifyPassword } from "@/server/api";
import { email } from "@/server/validation";

const schema = z.object({ email, password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    await limit(db, `login:${clientKey(request)}`, 12, 900);
    const input = await body(request, schema);
    const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user?.passwordHash || !await verifyPassword(input.password, user.passwordHash)) throw new ApiError(401, "Invalid email or password");
    return json({ user: publicUser(user) }, 200, { "Set-Cookie": await createSession(db, user.id, request) });
  } catch (error) { return fail(error); }
}
