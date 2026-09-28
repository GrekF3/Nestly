import { listings } from "@/db/schema";

export type ListingRow = typeof listings.$inferSelect;
export function publicListing(row: ListingRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    city: row.city,
    district: row.district,
    approximateAddress: `${row.district}, ${row.city}`,
    propertyType: row.propertyType,
    availableFrom: row.availableFrom,
    minimumLeaseMonths: row.minimumLeaseMonths,
    transitStation: row.transitStation,
    transitWalkMinutes: row.transitWalkMinutes,
    monthlyRent: row.monthlyRent,
    depositMonths: row.depositMonths,
    oneTimeFeesTHB: row.oneTimeFeesTHB,
    recurringFeesTHB: row.recurringFeesTHB,
    agentFeeTHB: row.agentFeeTHB,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaSqm: row.areaSqm,
    lat: row.lat === null ? null : Math.round(row.lat * 100) / 100,
    lng: row.lng === null ? null : Math.round(row.lng * 100) / 100,
    mediaUrls: row.mediaUrls,
    verificationStatus: row.verificationStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
