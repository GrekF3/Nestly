import type { CreateMockPaymentIntent, MockPaymentEvent, MockPaymentIntent, NotificationEvent, PaymentStatus } from "../../../packages/shared/worker-contract";

export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

export function parseCreateIntent(value: unknown): CreateMockPaymentIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!isId(item.tenantId) || !isId(item.userId) || !isId(item.listingId)) return null;
  if (!Number.isSafeInteger(item.amountMinor) || (item.amountMinor as number) < 100 || (item.amountMinor as number) > 100_000_000) return null;
  if (item.currency !== "THB") return null;
  return {
    tenantId: item.tenantId,
    userId: item.userId,
    listingId: item.listingId,
    amountMinor: item.amountMinor as number,
    currency: "THB",
  };
}

export function parsePaymentEvent(value: unknown): MockPaymentEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!isId(item.eventId) || !isId(item.tenantId)) return null;
  if (typeof item.intentId !== "string" || !/^mpi_[a-f0-9]{64}$/.test(item.intentId)) return null;
  if (item.status !== "succeeded" && item.status !== "failed" && item.status !== "canceled") return null;
  return { eventId: item.eventId, intentId: item.intentId, tenantId: item.tenantId, status: item.status };
}

export function parseNotification(value: unknown): NotificationEvent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!isId(item.eventId) || !isId(item.tenantId) || !isId(item.subjectId)) return null;
  if (item.type !== "support.ticket.created" && item.type !== "verification.requested") return null;
  if (!Number.isSafeInteger(item.occurredAt) || (item.occurredAt as number) <= 0) return null;
  return {
    eventId: item.eventId,
    type: item.type,
    tenantId: item.tenantId,
    subjectId: item.subjectId,
    occurredAt: item.occurredAt as number,
  };
}

export function nextPaymentStatus(current: PaymentStatus, requested: Exclude<PaymentStatus, "pending">): PaymentStatus | null {
  return current === "pending" ? requested : null;
}

export function sameCreateIntent(existing: MockPaymentIntent, requested: CreateMockPaymentIntent): boolean {
  return existing.tenantId === requested.tenantId && existing.userId === requested.userId &&
    existing.listingId === requested.listingId && existing.amountMinor === requested.amountMinor &&
    existing.currency === requested.currency;
}
