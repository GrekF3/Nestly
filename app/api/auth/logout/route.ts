import { getDb } from "@/db";
import { clearSession, fail, json, revokeSession, safeMutation } from "@/server/api";

export async function POST(request: Request) {
  try {
    safeMutation(request);
    await revokeSession(getDb(), request);
    return json({ ok: true }, 200, { "Set-Cookie": clearSession(request) });
  } catch (error) { return fail(error); }
}
