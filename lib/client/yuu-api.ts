export type YuuRole = "renter" | "owner" | "support" | "admin";

export type YuuUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role: YuuRole;
  verified?: boolean;
  phoneVerified?: boolean;
};

export type OwnerListingInput = {
  title: string;
  description: string;
  city: string;
  district: string;
  approximateAddress: string;
  monthlyRent: number;
  depositMonths: number;
  bedrooms: number;
  bathrooms: number;
  areaSqm: number;
  mediaUrls: string[];
  oneTimeFeesTHB?: number | null;
  recurringFeesTHB?: number | null;
  agentFeeTHB?: number | null;
  propertyType?: "condo" | "apartment" | "house";
  availableFrom?: string | null;
  minimumLeaseMonths?: number | null;
  transitStation?: string | null;
  transitWalkMinutes?: number | null;
};

export type ServerListing = {
  id: string | number;
  title: string;
  description?: string | null;
  city?: string | null;
  district?: string | null;
  approximateAddress?: string | null;
  monthlyRent?: number;
  depositMonths?: number;
  bedrooms?: number;
  bathrooms?: number;
  areaSqm?: number;
  lat?: number | null;
  lng?: number | null;
  verificationStatus?: string;
  propertyType?: "condo" | "apartment" | "house" | null;
  availableFrom?: string | null;
  minimumLeaseMonths?: number | null;
  transitStation?: string | null;
  transitWalkMinutes?: number | null;
  oneTimeFeesTHB?: number | null;
  recurringFeesTHB?: number | null;
  agentFeeTHB?: number | null;
  mediaUrls?: string[];
  status?: string;
  ownerId?: string;
  createdAt?: string;
  checks?: Array<{ id: string; listingId: string; kind: "identity" | "ownership" | "media" | "lease"; status: "pending" | "passed" | "failed"; publicNote?: string | null; reviewedBy?: string | null; reviewedAt?: string | null }>;
};

export type Viewing = {
  id: string;
  listingId: string | number;
  requestedAt: string;
  status?: string;
  notes?: string | null;
  listing?: Pick<ServerListing, "id" | "title">;
};

export type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status?: string;
  createdAt?: string;
};

export type ListingTrust = {
  listingId: string | number;
  verified: boolean;
  checks: Array<{ kind: string; status: string; publicNote?: string | null; reviewedAt?: string | null }>;
  cost: {
    monthlyRent: number;
    depositMonths: number;
    depositTHB: number;
    oneTimeFeesTHB: number | null;
    recurringFeesTHB: number | null;
    agentFeeTHB: number | null;
    knownMoveInSubtotalTHB: number;
    moveInTotalTHB?: number | null;
    allFeesConfirmed: boolean;
  };
};

export type MockPaymentIntent = {
  id: string;
  listingId: string;
  amountMinor: number;
  currency: "THB";
  status: "pending" | "succeeded" | "failed" | "canceled";
  provider: "mock";
  liveCharge: false;
};

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError("Не удалось связаться с сервисом. Проверьте соединение и попробуйте ещё раз.", 0);
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error
      : typeof payload?.message === "string" ? payload.message
      : response.status === 401 ? "Войдите в аккаунт, чтобы продолжить."
      : response.status === 403 ? "У вашего аккаунта нет доступа к этому разделу."
      : "Не удалось выполнить действие. Попробуйте ещё раз.";
    throw new ApiError(message, response.status);
  }
  return payload as T;
}

const json = (value: unknown) => JSON.stringify(value);

export async function uploadListingPhoto(file: File): Promise<{ id: string; url: string; mimeType: string; sizeBytes: number }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ApiError("Choose JPEG, PNG or WebP images.", 400);
  if (file.size > 10 * 1024 * 1024) throw new ApiError("Each photo must be 10 MB or smaller.", 400);
  if (typeof createImageBitmap !== "function") throw new ApiError("This browser cannot prepare photos safely. Remove location metadata from the image and try a newer browser.", 400);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ApiError("This photo could not be opened. Try another JPEG, PNG or WebP file.", 400);
  }
  const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new ApiError("Photo preparation is unavailable in this browser.", 400); }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const clean = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  canvas.width = 0;
  canvas.height = 0;
  if (!clean) throw new ApiError("Could not prepare this photo. Try another image.", 400);
  if (clean.size > 10 * 1024 * 1024) throw new ApiError("Prepared photo exceeds 10 MB. Choose a smaller image.", 400);
  return request<{ id: string; url: string; mimeType: string; sizeBytes: number }>("/api/media/upload", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: clean });
}

export const yuuApi = {
  me: () => request<{ user: YuuUser | null }>("/api/auth/me"),
  register: (value: { name: string; email: string; password: string }) => request<{ user: YuuUser }>("/api/auth/register", { method: "POST", body: json(value) }),
  login: (value: { email: string; password: string }) => request<{ user: YuuUser }>("/api/auth/login", { method: "POST", body: json(value) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  startPhone: (phone: string) => request<{ ok: boolean; expiresInSeconds: number; mockCode?: string }>("/api/auth/phone/start", { method: "POST", body: json({ phone }) }),
  verifyPhone: (phone: string, code: string) => request<{ user: YuuUser }>("/api/auth/phone/verify", { method: "POST", body: json({ phone, code }) }),
  listings: (params: URLSearchParams) => request<{ items: ServerListing[]; nextCursor?: string | null }>(`/api/listings?${params}`),
  trust: (id: string | number) => request<ListingTrust>(`/api/listings/${encodeURIComponent(String(id))}/trust`),
  startMockPayment: (listingId: string | number, idempotencyKey: string) => request<{ intent: MockPaymentIntent; liveCharge: false }>("/api/payments/intents", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: json({ listingId: String(listingId) }) }),
  mockPayment: (id: string) => request<{ intent: MockPaymentIntent; liveCharge: false }>(`/api/payments/intents/${encodeURIComponent(id)}`),
  simulateMockPayment: (id: string, status: "succeeded" | "failed" | "canceled") => request<{ intent: MockPaymentIntent; liveCharge: false }>(`/api/payments/intents/${encodeURIComponent(id)}/simulate`, { method: "POST", body: json({ status }) }),
  createViewing: (value: { listingId: string | number; requestedAt: string; notes?: string }) => request<{ viewing: Viewing }>("/api/viewings", { method: "POST", body: json(value) }),
  viewings: () => request<{ items: Viewing[] }>("/api/viewings"),
  createOwnerListing: (value: OwnerListingInput) => request<{ listing: ServerListing }>("/api/owner/listings", { method: "POST", body: json(value) }),
  ownerListings: () => request<{ items: ServerListing[] }>("/api/owner/listings"),
  adminListings: (status = "pending") => request<{ items: ServerListing[] }>(`/api/admin/listings?status=${encodeURIComponent(status)}`),
  moderateListing: (id: string | number, status: "published" | "rejected" | "pending", rejectionReason?: string) => request<{ listing: ServerListing }>(`/api/admin/listings/${encodeURIComponent(String(id))}`, { method: "PATCH", body: json({ status, rejectionReason }) }),
  reviewListingCheck: (id: string | number, value: { kind: "identity" | "ownership" | "media" | "lease"; status: "passed" | "failed" | "pending"; publicNote?: string }) => request<{ check: NonNullable<ServerListing["checks"]>[number]; verified: boolean }>(`/api/admin/listings/${encodeURIComponent(String(id))}/checks`, { method: "PATCH", body: json(value) }),
  updateListingCost: (id: string | number, value: { oneTimeFeesTHB: number; recurringFeesTHB: number; agentFeeTHB: number }) => request<{ listing: ServerListing }>(`/api/admin/listings/${encodeURIComponent(String(id))}/cost`, { method: "PATCH", body: json(value) }),
  adminUsers: () => request<{ items: YuuUser[] }>("/api/admin/users"),
  updateUser: (id: string, value: { role?: YuuRole; verified?: boolean }) => request<{ user: YuuUser }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: json(value) }),
  createTicket: (value: { subject: string; message: string }) => request<{ ticket: SupportTicket }>("/api/support/tickets", { method: "POST", body: json(value) }),
  tickets: () => request<{ items: SupportTicket[] }>("/api/support/tickets"),
};
