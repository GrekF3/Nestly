import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  phone: text("phone"),
  phoneVerifiedAt: text("phone_verified_at"),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  role: text("role", { enum: ["renter", "owner", "support", "admin"] }).notNull().default("renter"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("users_email_unique").on(table.email), uniqueIndex("users_phone_unique").on(table.phone)]);

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)]);

export const phoneCodes = sqliteTable("phone_codes", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("phone_codes_phone_idx").on(table.phone)]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: integer("reset_at").notNull(),
});

export const listings = sqliteTable("listings", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  city: text("city").notNull(),
  district: text("district").notNull(),
  approximateAddress: text("approximate_address").notNull(),
  propertyType: text("property_type", { enum: ["condo", "apartment", "house"] }),
  availableFrom: text("available_from"),
  minimumLeaseMonths: integer("minimum_lease_months"),
  transitStation: text("transit_station"),
  transitWalkMinutes: integer("transit_walk_minutes"),
  monthlyRent: integer("monthly_rent").notNull(),
  depositMonths: integer("deposit_months").notNull(),
  oneTimeFeesTHB: integer("one_time_fees_thb"),
  recurringFeesTHB: integer("recurring_fees_thb"),
  agentFeeTHB: integer("agent_fee_thb"),
  bedrooms: integer("bedrooms").notNull(),
  bathrooms: integer("bathrooms").notNull(),
  areaSqm: real("area_sqm").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  mediaUrls: text("media_urls", { mode: "json" }).$type<string[]>().notNull(),
  status: text("status", { enum: ["pending", "published", "rejected"] }).notNull().default("pending"),
  verificationStatus: text("verification_status", { enum: ["unverified", "documents_pending", "verified"] }).notNull().default("unverified"),
  rejectionReason: text("rejection_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("listings_status_city_idx").on(table.status, table.city), index("listings_owner_idx").on(table.ownerId)]);

export const listingChecks = sqliteTable("listing_checks", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["identity", "ownership", "media", "lease"] }).notNull(),
  status: text("status", { enum: ["pending", "passed", "failed"] }).notNull().default("pending"),
  publicNote: text("public_note").notNull().default(""),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: text("reviewed_at"),
}, (table) => [uniqueIndex("listing_checks_listing_kind_unique").on(table.listingId, table.kind)]);

export const viewings = sqliteTable("viewings", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull().references(() => listings.id),
  renterId: text("renter_id").notNull().references(() => users.id),
  requestedAt: text("requested_at").notNull(),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["requested", "accepted", "declined", "cancelled"] }).notNull().default("requested"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("viewings_renter_idx").on(table.renterId), index("viewings_listing_idx").on(table.listingId)]);

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  status: text("status", { enum: ["open", "pending", "resolved"] }).notNull().default("open"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("support_tickets_user_idx").on(table.userId)]);

export const supportMessages = sqliteTable("support_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTickets.id),
  authorId: text("author_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("support_messages_ticket_idx").on(table.ticketId)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  details: text("details", { mode: "json" }).$type<Record<string, string | number | boolean | null>>().notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_events_target_idx").on(table.targetType, table.targetId)]);

export const paymentIntents = sqliteTable("payment_intents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  listingId: text("listing_id").notNull().references(() => listings.id),
  amountMinor: integer("amount_minor").notNull(),
  status: text("status", { enum: ["pending", "succeeded", "failed", "canceled"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("payment_intents_user_idx").on(table.userId)]);

export const notificationOutbox = sqliteTable("notification_outbox", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["support.ticket.created", "verification.requested"] }).notNull(),
  subjectId: text("subject_id").notNull(),
  deliveredAt: text("delivered_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("notification_outbox_pending_idx").on(table.deliveredAt)]);

export const inboundWorkerEvents = sqliteTable("inbound_worker_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  subjectId: text("subject_id").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  listingId: text("listing_id").references(() => listings.id),
  r2Key: text("r2_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("media_assets_owner_idx").on(table.ownerId), index("media_assets_listing_idx").on(table.listingId)]);
