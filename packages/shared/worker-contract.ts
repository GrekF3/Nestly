/** Server-to-server contract. Never call these routes with browser credentials. */
export type PaymentStatus = "pending" | "succeeded" | "failed" | "canceled";

export type MockPaymentIntent = {
  id: string;
  tenantId: string;
  userId: string;
  listingId: string;
  amountMinor: number;
  currency: "THB";
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
  provider: "mock";
  liveCharge: false;
};

export type CreateMockPaymentIntent = Pick<
  MockPaymentIntent,
  "tenantId" | "userId" | "listingId" | "amountMinor" | "currency"
>;

export type MockPaymentEvent = {
  eventId: string;
  intentId: string;
  tenantId: string;
  status: Exclude<PaymentStatus, "pending">;
};

export type NotificationEvent = {
  eventId: string;
  type: "support.ticket.created" | "verification.requested";
  tenantId: string;
  subjectId: string;
  occurredAt: number;
  /** Only opaque IDs are accepted: fetch sensitive content from the backend. */
};
