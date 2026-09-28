import { env } from "cloudflare:workers";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { rateLimits, sessions, users } from "@/db/schema";
import { z, ZodError } from "zod";

export type AppDb = ReturnType<typeof getDb>;
export type AppUser = typeof users.$inferSelect;
export type PublicUser = Pick<AppUser, "id" | "email" | "phone" | "phoneVerifiedAt" | "name" | "role" | "verified">;
type RuntimeEnv = Cloudflare.Env & {
  APP_ENV?: string;
  ALLOW_MOCK_SMS?: string;
  OTP_PEPPER?: string;
  SMS_API_URL?: string;
  SMS_API_TOKEN?: string;
  OPERATIONS_WORKER_URL?: string;
  INTERNAL_HMAC_SECRET?: string;
  CALLBACK_HMAC_SECRET?: string;
  YUU_TENANT_ID?: string;
  MOCK_PROVIDER_HMAC_SECRET?: string;
  PAYMENTS_MODE?: string;
};

export function runtimeEnv(): RuntimeEnv { return env as RuntimeEnv; }
export function publicUser(user: AppUser): PublicUser {
  return { id: user.id, email: user.email, phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, name: user.name, role: user.role, verified: user.verified };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
export function fail(error: unknown): Response {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof ZodError) return json({ error: "Invalid input", fields: error.flatten().fieldErrors }, 400);
  console.error("API failure", error instanceof Error ? error.message : "unknown");
  return json({ error: "Internal server error" }, 500);
}

export async function readCappedBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body required");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new ApiError(413, "Request too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function readCappedBody(request: Request, maxBytes: number): Promise<string> {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(await readCappedBytes(request, maxBytes)); }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "Invalid UTF-8"); }
}

export async function body<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) throw new ApiError(415, "JSON required");
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > 32_768) throw new ApiError(413, "Request too large");
  const raw = await readCappedBody(request, 32_768);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new ApiError(400, "Invalid JSON"); }
  return schema.parse(parsed);
}

export function safeMutation(request: Request) {
  const origin = request.headers.get("origin");
  const target = new URL(request.url).origin;
  if (!origin || origin !== target) throw new ApiError(403, "Request origin rejected");
}

export function clientKey(request: Request): string {
  // CF-Connecting-IP is set by Cloudflare; avoid trusting user supplied X-Forwarded-For.
  return request.headers.get("cf-connecting-ip") ?? "local";
}

export async function limit(db: AppDb, key: string, max: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + windowSeconds;
  const [row] = await db.insert(rateLimits).values({ key, count: 1, resetAt }).onConflictDoUpdate({
    target: rateLimits.key,
    set: {
      count: sql`case when ${rateLimits.resetAt} <= ${now} then 1 else ${rateLimits.count} + 1 end`,
      resetAt: sql`case when ${rateLimits.resetAt} <= ${now} then ${resetAt} else ${rateLimits.resetAt} end`,
    },
  }).returning();
  if (row.count > max) throw new ApiError(429, "Too many requests. Try again later.");
}

export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function bytesToHex(bytes: Uint8Array) { return [...bytes].map((v) => v.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new Error("Invalid hash");
  const result = new Uint8Array(new ArrayBuffer(value.length / 2));
  for (let i = 0; i < result.length; i++) result[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return result;
}

export async function passwordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 310_000 }, key, 256);
  return `pbkdf2-sha256:310000:${bytesToHex(salt)}:${bytesToHex(new Uint8Array(bits))}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsRaw, saltRaw, hashRaw] = encoded.split(":");
  const iterations = Number(iterationsRaw);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  try {
    const salt = hexToBytes(saltRaw);
    const expected = hexToBytes(hashRaw);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.byteLength * 8);
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch { return false; }
}

const COOKIE = "yuu_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
export async function createSession(db: AppDb, userId: string, request: Request): Promise<string> {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await db.insert(sessions).values({ tokenHash: await digest(token), userId, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}
export function clearSession(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
export async function currentUser(db: AppDb, request: Request): Promise<AppUser | null> {
  const cookie = request.headers.get("cookie")?.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${COOKIE}=`));
  const token = cookie?.slice(COOKIE.length + 1);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const [row] = await db.select({ user: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(and(eq(sessions.tokenHash, await digest(token)), gt(sessions.expiresAt, Math.floor(Date.now() / 1000)))).limit(1);
  return row?.user ?? null;
}
export async function requireUser(db: AppDb, request: Request): Promise<AppUser> {
  const user = await currentUser(db, request);
  if (!user) throw new ApiError(401, "Sign in required");
  return user;
}
export async function requireRole(db: AppDb, request: Request, roles: AppUser["role"][]): Promise<AppUser> {
  const user = await requireUser(db, request);
  if (!roles.includes(user.role)) throw new ApiError(403, "Access denied");
  return user;
}
export async function revokeSession(db: AppDb, request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${COOKIE}=`));
  const token = cookie?.slice(COOKIE.length + 1);
  if (token && /^[0-9a-f]{64}$/.test(token)) await db.delete(sessions).where(eq(sessions.tokenHash, await digest(token)));
}
