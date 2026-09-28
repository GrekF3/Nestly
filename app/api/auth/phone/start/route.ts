import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { phoneCodes } from "@/db/schema";
import { body, clientKey, digest, fail, json, limit, safeMutation } from "@/server/api";
import { mockSmsEnabled, phoneCodeHash, sendSms } from "@/server/phone";
import { phone } from "@/server/validation";

const schema = z.object({ phone });
export async function POST(request: Request) {
  try {
    safeMutation(request);
    const db = getDb();
    const input = await body(request, schema);
    await limit(db, `sms-ip:${clientKey(request)}`, 10, 3600);
    await limit(db, `sms-phone:${await digest(input.phone)}`, 3, 900);
    const id = crypto.randomUUID();
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.insert(phoneCodes).values({ id, phone: input.phone, codeHash: await phoneCodeHash(input.phone, id, code), expiresAt: Math.floor(Date.now() / 1000) + 300 });
    try { await sendSms(input.phone, code); }
    catch (error) { await db.delete(phoneCodes).where(eq(phoneCodes.id, id)); throw error; }
    return json({ ok: true, expiresInSeconds: 300, ...(mockSmsEnabled() ? { mockCode: code } : {}) });
  } catch (error) { return fail(error); }
}
