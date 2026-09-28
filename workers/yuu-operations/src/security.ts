const encoder = new TextEncoder();

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[a-f0-9]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

export async function verifySignedRequest(
  request: Request,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret || new URL(request.url).search) return false;
  const timestampText = request.headers.get("x-yuu-timestamp");
  const signature = request.headers.get("x-yuu-signature");
  if (!timestampText || !/^[0-9]{10,12}$/.test(timestampText) || !signature?.startsWith("v1=")) return false;
  const timestamp = Number(timestampText);
  if (Math.abs(nowSeconds - timestamp) > 300) return false;
  const provided = decodeHex(signature.slice(3));
  if (!provided) return false;
  const pathname = new URL(request.url).pathname;
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  const message = `${timestampText}.${request.method.toUpperCase()}.${pathname}.${idempotencyKey}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, provided, encoder.encode(message));
}

export async function signRequest(
  secret: string,
  timestampSeconds: number,
  method: string,
  pathname: string,
  rawBody: string,
  idempotencyKey = "",
): Promise<string> {
  return `v1=${await hmacHex(secret, `${timestampSeconds}.${method.toUpperCase()}.${pathname}.${idempotencyKey}.${rawBody}`)}`;
}

export async function stableIntentId(secret: string, tenantId: string, idempotencyKey: string): Promise<string> {
  const digest = await hmacHex(secret, `${tenantId}\0${idempotencyKey}`);
  return `mpi_${digest}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
