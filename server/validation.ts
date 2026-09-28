import { z } from "zod";

export const email = z.string().trim().toLowerCase().email().max(254);
export const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Use an international number such as +1 555 010 0000");
export const password = z.string().min(12).max(128);
export const listingInput = z.object({
  title: z.string().trim().min(8).max(140),
  description: z.string().trim().min(40).max(8000),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().min(2).max(100),
  approximateAddress: z.string().trim().min(4).max(240),
  propertyType: z.enum(["condo", "apartment", "house"]).nullable().optional(),
  availableFrom: z.iso.date().nullable().optional(),
  minimumLeaseMonths: z.number().int().min(1).max(60).nullable().optional(),
  transitStation: z.string().trim().min(2).max(100).nullable().optional(),
  transitWalkMinutes: z.number().int().min(0).max(240).nullable().optional(),
  monthlyRent: z.number().int().min(1000).max(2_000_000),
  depositMonths: z.number().int().min(0).max(6),
  oneTimeFeesTHB: z.number().int().min(0).max(1_000_000).nullable().optional(),
  recurringFeesTHB: z.number().int().min(0).max(1_000_000).nullable().optional(),
  agentFeeTHB: z.number().int().min(0).max(1_000_000).nullable().optional(),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().int().min(1).max(20),
  areaSqm: z.number().min(8).max(10000),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  mediaUrls: z.array(z.string().regex(/^\/api\/media\/[0-9a-f-]{36}$/)).max(30).default([]),
});

export const viewingInput = z.object({
  listingId: z.string().uuid(),
  requestedAt: z.string().datetime({ offset: true }).refine((v) => {
    const t = Date.parse(v);
    return t > Date.now() && t < Date.now() + 60 * 24 * 60 * 60 * 1000;
  }, "Choose a time within the next 60 days"),
  notes: z.string().trim().max(1000).default(""),
});
