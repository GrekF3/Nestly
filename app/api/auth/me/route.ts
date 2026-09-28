import { getDb } from "@/db";
import { currentUser, fail, json, publicUser } from "@/server/api";

export async function GET(request: Request) {
  try {
    const user = await currentUser(getDb(), request);
    return json({ user: user ? publicUser(user) : null });
  } catch (error) { return fail(error); }
}
