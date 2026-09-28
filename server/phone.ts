import { runtimeEnv, ApiError } from "./api";

export function mockSmsEnabled() {
  const env = runtimeEnv();
  return env.APP_ENV === "development" && env.ALLOW_MOCK_SMS === "true";
}

export async function phoneCodeHash(phone: string, id: string, code: string): Promise<string> {
  const pepper = runtimeEnv().OTP_PEPPER;
  if (!pepper || pepper.length < 32) throw new ApiError(503, "Phone verification is unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${phone}:${id}:${code}`));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sendSms(phone: string, code: string): Promise<void> {
  const env = runtimeEnv();
  if (mockSmsEnabled()) return;
  if (!env.SMS_API_URL?.startsWith("https://") || !env.SMS_API_TOKEN) throw new ApiError(503, "Phone verification is unavailable");
  const response = await fetch(env.SMS_API_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.SMS_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: phone, message: `Your YUU verification code is ${code}. It expires in 5 minutes.` }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new ApiError(503, "Phone verification is temporarily unavailable");
}
