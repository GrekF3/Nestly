"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Bath,
  BedDouble,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleUserRound,
  Clock3,
  Heart,
  Layers3,
  Languages,
  ListFilter,
  LoaderCircle,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageCircle,
  Headphones,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrainFront,
  X,
} from "lucide-react";
import { ProductFlows } from "@/components/yuu/product-flows";
import { MockPaymentPanel } from "@/components/yuu/mock-payment";
import { DepositReturnChecklist, ListingCostBreakdown, ListingTrustPassport, knownMoveInSubtotal } from "@/components/yuu/listing-trust";
import { type ListingTrust, type ServerListing, type YuuUser, yuuApi } from "@/lib/client/yuu-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Listing = {
  id: number;
  serverId: string | number;
  title: string;
  district: string;
  address: string;
  transit: string;
  price: number;
  depositMonths: number;
  oneTimeFeesTHB: number | null;
  recurringFeesTHB: number | null;
  agentFeeTHB: number | null;
  description: string;
  verificationStatus: string;
  mediaEvidence: boolean;
  deposit: string;
  beds: number;
  baths: number;
  size: number;
  floor: string;
  images: string[];
  proof: string;
  available: string;
  feature: string;
  propertyType: "Condo" | "Apartment" | "House" | "Unknown";
  transitWalkMinutes: number | null;
  availableTiming: "Ready now" | "Within 30 days" | "Unknown";
  leaseOptions: Array<"6-12 months" | "12+ months">;
  marker: { left: string; top: string };
  coordinates: [number, number];
};


const formatTHB = (value: number) => new Intl.NumberFormat("en-US").format(value);
const safeListingImage = (url: string) => /^\/api\/media\/[a-zA-Z0-9-]+$/.test(url) || /^https?:\/\//.test(url);

function toListing(item: ServerListing, index: number): Listing {
  const lat = typeof item.lat === "number" ? item.lat : 13.746 + (index % 3 - 1) * 0.012;
  const lng = typeof item.lng === "number" ? item.lng : 100.566 + (index % 4 - 1.5) * 0.012;
  const verificationStatus = item.verificationStatus || "pending";
  const checked = verificationStatus === "verified" || verificationStatus === "approved";
  return {
    id: index + 1,
    serverId: item.id,
    title: item.title,
    district: item.district || item.city || "Thailand",
    address: item.approximateAddress || "Approximate location",
    transit: item.transitStation ? `${item.transitWalkMinutes != null ? `${item.transitWalkMinutes} min walk to ` : "Near "}${item.transitStation}` : "Explore the area on the map",
    transitWalkMinutes: item.transitWalkMinutes ?? null,
    price: Number(item.monthlyRent || 0),
    deposit: `${Number(item.depositMonths || 0)}-month deposit`,
    depositMonths: Number(item.depositMonths || 0),
    oneTimeFeesTHB: item.oneTimeFeesTHB ?? null,
    recurringFeesTHB: item.recurringFeesTHB ?? null,
    agentFeeTHB: item.agentFeeTHB ?? null,
    description: item.description || "",
    verificationStatus,
    mediaEvidence: Boolean(item.mediaUrls?.length),
    beds: Number(item.bedrooms || 0),
    baths: Number(item.bathrooms || 0),
    size: Number(item.areaSqm || 0),
    floor: "Long-stay home",
    images: item.mediaUrls?.filter(safeListingImage) || [],
    proof: checked ? "Listing checks completed" : "Owner-submitted listing",
    available: item.availableFrom ? `Available ${new Date(item.availableFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Ask about availability",
    feature: "Request details",
    propertyType: item.propertyType ? (item.propertyType.charAt(0).toUpperCase() + item.propertyType.slice(1)) as Listing["propertyType"] : "Unknown",
    availableTiming: item.availableFrom ? new Date(item.availableFrom).getTime() <= Date.now() ? "Ready now" : new Date(item.availableFrom).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000 ? "Within 30 days" : "Unknown" : "Unknown",
    leaseOptions: item.minimumLeaseMonths == null ? [] : item.minimumLeaseMonths <= 6 ? ["6-12 months", "12+ months"] : item.minimumLeaseMonths <= 12 ? ["12+ months"] : [],
    marker: { left: "50%", top: "50%" },
    coordinates: [lat, lng],
  };
}

type WebMCPContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

export default function Home() {
  const homeContentRef = useRef<HTMLDivElement>(null);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const mapLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const mapMarkerRefs = useRef<globalThis.Map<number, import("leaflet").Marker>>(new globalThis.Map());
  const activeSwipeImageRefs = useRef<Record<number, HTMLImageElement | null>>({});
  const touchStartX = useRef<Record<number, number>>({});
  const swipeDidMove = useRef<Record<number, boolean>>({});
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapSearchTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const lastSearchCenterRef = useRef<[number, number]>([13.746, 100.566]);
  const mapSearchStatusRef = useRef<"hidden" | "available" | "loading" | "updated">("hidden");
  const [favorites, setFavorites] = useState<Array<string | number>>([]);
  const favoritesRestoredRef = useRef(false);
  const [inventory, setInventory] = useState<Listing[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");
  const [inventoryReload, setInventoryReload] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [user, setUser] = useState<YuuUser | null>(null);
  const [productPanel, setProductPanel] = useState<"account" | "viewing" | "owner" | "admin" | "support" | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentListing, setPaymentListing] = useState<{ id: string | number; title: string } | null>(null);
  const [selectedTrust, setSelectedTrust] = useState<ListingTrust | null>(null);
  const [trustError, setTrustError] = useState<{ id: string | number; message: string } | null>(null);
  const [imageIndexes, setImageIndexes] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<Listing | null>(null);
  const [viewingListing, setViewingListing] = useState<{ id: string | number; title: string } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [query, setQuery] = useState("Bangkok");
  const [price, setPrice] = useState([0, 120000]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [noAgentFee, setNoAgentFee] = useState(false);
  const [nearTransit, setNearTransit] = useState(false);
  const [moveIn, setMoveIn] = useState<"Anytime" | "Ready now" | "Within 30 days">("Anytime");
  const [lease, setLease] = useState<"Any lease" | "6-12 months" | "12+ months">("Any lease");
  const [propertyType, setPropertyType] = useState<"Any type" | Listing["propertyType"]>("Any type");
  const [bedrooms, setBedrooms] = useState<number[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeNav, setActiveNav] = useState("Homes");
  const [sort, setSort] = useState("Best match");
  const [mapStyle, setMapStyle] = useState<"streets" | "light">("streets");
  const [mapSearchStatus, setMapSearchStatus] = useState<"hidden" | "available" | "loading" | "updated">("hidden");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<"success" | "error">("success");

  useEffect(() => {
    let active = true;
    void yuuApi.me().then(({ user: currentUser }) => {
      if (active) setUser(currentUser);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("yuu:favorites") || "[]") as unknown;
        if (Array.isArray(saved)) setFavorites(saved.filter((id): id is string | number => typeof id === "string" || typeof id === "number"));
      } catch { /* Ignore invalid local browser data. */ }
      favoritesRestoredRef.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!favoritesRestoredRef.current) return;
    localStorage.setItem("yuu:favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    let active = true;
    void yuuApi.listings(new URLSearchParams({ city: "Bangkok", limit: "50" })).then((response) => {
      if (!active) return;
      setInventory((response.items ?? []).map(toListing));
      setInventoryLoading(false);
    }).catch((error) => {
      if (!active) return;
      setInventoryError(error instanceof Error ? error.message : "Homes are temporarily unavailable.");
      setInventoryLoading(false);
    });
    return () => { active = false; };
  }, [inventoryReload]);

  useEffect(() => {
    if (!selected) return;
    const firstFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => homeContentRef.current?.scrollTo({ top: 0 }));
    });
    return () => cancelAnimationFrame(firstFrame);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void yuuApi.trust(selected.serverId).then((trust) => {
      if (active) setSelectedTrust(trust);
    }).catch((error) => {
      if (active) setTrustError({ id: selected.serverId, message: error instanceof Error ? error.message : "Checks are unavailable right now." });
    });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    let disposed = false;
    const markerRefs = mapMarkerRefs.current;
    const initializeMap = async () => {
      const L = await import("leaflet");
      if (disposed || !mapElementRef.current || mapRef.current) return;

      const map = L.map(mapElementRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: true,
      }).setView([13.746, 100.566], 12);

      mapLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      map.on("moveend", () => {
        if (mapSearchStatusRef.current === "loading" || mapSearchStatusRef.current === "updated") return;
        const [lastLat, lastLng] = lastSearchCenterRef.current;
        const movedMeters = map.distance(map.getCenter(), L.latLng(lastLat, lastLng));
        const nextStatus = movedMeters > 3500 ? "available" : "hidden";
        mapSearchStatusRef.current = nextStatus;
        setMapSearchStatus(nextStatus);
      });

      mapRef.current = map;
      setMapReady(true);
      requestAnimationFrame(() => map.invalidateSize());
    };

    void initializeMap();
    return () => {
      disposed = true;
      markerRefs.clear();
      setMapReady(false);
      mapLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    let disposed = false;
    void import("leaflet").then((L) => {
      if (disposed) return;
      mapMarkerRefs.current.forEach((marker) => marker.remove());
      mapMarkerRefs.current.clear();
      inventory.forEach((item) => {
        const marker = L.marker(item.coordinates, {
          icon: L.divIcon({ className: "leaflet-price-marker", html: `<span>฿${Math.round(item.price / 1000)}k</span>`, iconSize: [58, 38], iconAnchor: [29, 19] }),
          title: `${item.title}, ฿${formatTHB(item.price)} per month`,
        }).addTo(map);
        marker.on("click", () => setSelected(item));
        marker.on("mouseover", () => setHovered(item.id));
        marker.on("mouseout", () => setHovered(null));
        mapMarkerRefs.current.set(item.id, marker);
      });
    });
    return () => { disposed = true; };
  }, [inventory, mapReady]);

  useEffect(() => {
    mapMarkerRefs.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("active", hovered === id || selected?.id === id);
    });
  }, [hovered, selected]);

  useEffect(() => {
    const url = mapStyle === "light"
      ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    mapLayerRef.current?.setUrl(url);
  }, [mapStyle]);

  useEffect(() => {
    if (mobileView !== "map") return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => mapRef.current?.invalidateSize({ animate: false }));
    });
    const settleTimer = setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 180);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      clearTimeout(settleTimer);
    };
  }, [mobileView]);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    mapSearchTimersRef.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMCPContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: "search_thailand_rentals",
          title: "Search Thailand rentals",
          description: "Update the visible long-stay rental search for a city or neighborhood.",
          inputSchema: {
            type: "object",
            properties: { location: { type: "string", minLength: 1 } },
            required: ["location"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const location = (input as { location?: unknown }).location;
            if (typeof location !== "string" || !location.trim()) throw new Error("location must be a non-empty string");
            setQuery(location.trim());
            setMobileView("list");
            return { location: location.trim(), resultCount: inventory.length };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "open_rental_details",
          title: "Open rental details",
          description: "Open the visible detail panel for a rental listing by its numeric ID.",
          inputSchema: {
            type: "object",
            properties: { listingId: { type: "integer", minimum: 1 } },
            required: ["listingId"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input) {
            const listingId = (input as { listingId?: unknown }).listingId;
            const listing = inventory.find((item) => item.id === listingId);
            if (!listing) throw new Error("listing not found");
            setSelected(listing);
            return { listingId: listing.id, title: listing.title, monthlyRentTHB: listing.price };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [inventory]);

  const visibleListings = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = inventory.filter((item) => {
      const matchesQuery = !normalized || normalized === "bangkok" ||
        `${item.district} ${item.title} ${item.address}`.toLowerCase().includes(normalized);
      const matchesPrice = item.price >= price[0] && item.price <= price[1];
      const matchesBedrooms = bedrooms.length === 0 || bedrooms.includes(item.beds);
      const matchesSaved = !savedOnly || favorites.includes(item.serverId);
      const matchesMoveIn = moveIn === "Anytime" || (moveIn === "Ready now" && item.availableTiming === "Ready now") || (moveIn === "Within 30 days" && item.availableTiming !== "Unknown");
      const matchesLease = lease === "Any lease" || item.leaseOptions.includes(lease);
      const matchesType = propertyType === "Any type" || item.propertyType === propertyType;
      const matchesTransit = !nearTransit || (item.transitWalkMinutes != null && item.transitWalkMinutes <= 15);
      const matchesChecks = !verifiedOnly || item.verificationStatus === "verified" || item.verificationStatus === "approved";
      const matchesAgentFee = !noAgentFee || item.agentFeeTHB === 0;
      return matchesQuery && matchesPrice && matchesBedrooms && matchesSaved && matchesMoveIn && matchesLease && matchesType && matchesTransit && matchesChecks && matchesAgentFee;
    });

    if (sort === "Lowest monthly rent") return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === "Newest homes") return [...filtered].sort((a, b) => b.id - a.id);
    return filtered;
  }, [bedrooms, favorites, inventory, lease, moveIn, nearTransit, noAgentFee, price, propertyType, query, savedOnly, sort, verifiedOnly]);

  useEffect(() => {
    const visibleIds = new Set(visibleListings.map((item) => item.id));
    mapMarkerRefs.current.forEach((marker, id) => {
      const element = marker.getElement();
      if (element) element.style.display = visibleIds.has(id) ? "block" : "none";
    });
  }, [visibleListings]);

  const toggleFavorite = (id: string | number) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const showNotice = (message: string, kind: "success" | "error" = "success") => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNoticeKind(kind);
    setNotice(message);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 2600);
  };

  const searchHomes = async () => {
    const normalized = query.trim().toLowerCase();
    const bangkokAreas = ["asoke", "on nut", "ari", "bang chak"];
    const params = new URLSearchParams({ limit: "50", minRent: String(price[0]), maxRent: String(price[1]) });
    params.set("city", bangkokAreas.includes(normalized) ? "Bangkok" : query.trim() || "Bangkok");
    if (bedrooms.length === 1) params.set("bedrooms", String(bedrooms[0]));
    if (propertyType !== "Any type") params.set("propertyType", propertyType.toLowerCase());
    if (nearTransit) params.set("nearTransit", "true");
    setInventoryLoading(true);
    try {
      const response = await yuuApi.listings(params);
      setInventory(response.items.map(toListing));
      setInventoryError("");
      setMobileView("list");
      showNotice("Search updated");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not update search. Try again.", "error");
    } finally {
      setInventoryLoading(false);
    }
  };

  const chooseNav = (item: string) => {
    setActiveNav(item);
    setSavedOnly(false);
    setMobileView("list");
  };

  const changeImage = (listing: Listing, direction: number) => {
    if (!listing.images.length) return;
    setImageIndexes((current) => {
      const currentIndex = current[listing.id] ?? 0;
      const nextIndex = (currentIndex + direction + listing.images.length) % listing.images.length;
      return { ...current, [listing.id]: nextIndex };
    });
  };

  const beginPhotoSwipe = (listing: Listing, startX: number, image: HTMLImageElement | null) => {
    touchStartX.current[listing.id] = startX;
    swipeDidMove.current[listing.id] = false;
    activeSwipeImageRefs.current[listing.id] = image;
    if (image) image.style.transition = "none";
  };

  const movePhotoSwipe = (listing: Listing, currentX: number) => {
    const startX = touchStartX.current[listing.id];
    if (typeof startX !== "number") return;
    const distance = currentX - startX;
    if (Math.abs(distance) > 7) swipeDidMove.current[listing.id] = true;
    const resistedDistance = Math.max(-96, Math.min(96, distance * 0.72));
    const image = activeSwipeImageRefs.current[listing.id];
    if (image) image.style.transform = `translate3d(${resistedDistance}px,0,0) scale(.99)`;
  };

  const handlePhotoSwipe = (listing: Listing, endX: number) => {
    const startX = touchStartX.current[listing.id];
    if (typeof startX !== "number") return;
    const distance = endX - startX;
    if (Math.abs(distance) > 48) changeImage(listing, distance < 0 ? 1 : -1);
    const image = activeSwipeImageRefs.current[listing.id];
    if (image) {
      image.style.transition = "transform .22s cubic-bezier(.16,1,.3,1)";
      image.style.transform = "";
    }
    delete activeSwipeImageRefs.current[listing.id];
    delete touchStartX.current[listing.id];
  };

  const cancelPhotoSwipe = (listing: Listing) => {
    delete touchStartX.current[listing.id];
    const image = activeSwipeImageRefs.current[listing.id];
    if (image) {
      image.style.transition = "transform .22s cubic-bezier(.16,1,.3,1)";
      image.style.transform = "";
    }
    delete activeSwipeImageRefs.current[listing.id];
  };

  const searchMapArea = async () => {
    if (!mapRef.current || mapSearchStatusRef.current !== "available") return;
    mapSearchStatusRef.current = "loading";
    setMapSearchStatus("loading");
    const bounds = mapRef.current.getBounds();
    try {
      const response = await yuuApi.listings(new URLSearchParams({
        south: bounds.getSouth().toFixed(4), west: bounds.getWest().toFixed(4), north: bounds.getNorth().toFixed(4), east: bounds.getEast().toFixed(4), limit: "50",
      }));
      setQuery("");
      setInventory(response.items.map(toListing));
      setInventoryError("");
      setInventoryLoading(false);
      const center = mapRef.current?.getCenter();
      if (center) lastSearchCenterRef.current = [center.lat, center.lng];
      mapSearchStatusRef.current = "updated";
      setMapSearchStatus("updated");
      const dismissTimer = setTimeout(() => {
        mapSearchStatusRef.current = "hidden";
        setMapSearchStatus("hidden");
      }, 1050);
      mapSearchTimersRef.current.push(dismissTimer);
    } catch (error) {
      mapSearchStatusRef.current = "available";
      setMapSearchStatus("available");
      showNotice(error instanceof Error ? error.message : "Could not update this area. Try again.", "error");
    }
  };

  const updatePrice = (index: 0 | 1, rawValue: string) => {
    const value = Math.max(0, Number(rawValue.replace(/\D/g, "")) || 0);
    setPrice((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  return (
    <main className={`marketplace-shell ${activeNav !== "Homes" ? "has-content-page" : ""}`}>
      <header className="site-header">
        <button className="wordmark" aria-label="YUU home" onClick={() => chooseNav("Homes")}>
          <span className="wordmark-symbol" aria-hidden="true">
            <svg viewBox="0 0 36 36" role="img">
              <path d="M9.5 10.5 18 19l8.5-8.5" />
              <path className="mark-stem" d="M18 19v8" />
              <circle cx="26.5" cy="10.5" r="2.4" />
            </svg>
          </span>
          <span className="wordmark-lockup"><strong className="wordmark-name">YUU</strong><small>Thailand long stay</small></span>
        </button>

        <nav className="primary-nav" aria-label="Primary navigation">
          {["Homes", "Neighbourhoods", "Rental guide", "For owners"].map((item) => (
            <button key={item} className={activeNav === item ? "active" : ""} onClick={() => chooseNav(item)}>{item}</button>
          ))}
        </nav>

        <div className="header-tools">
          <span className="language-button" aria-label="Language English, prices in Thai baht"><Languages size={17} /> EN <span>THB</span></span>
          <button className={`header-icon ${savedOnly ? "active" : ""}`} aria-label="Saved homes" onClick={() => { setActiveNav("Homes"); setSavedOnly((current) => !current); setMobileView("list"); }}><Heart size={19} fill={savedOnly ? "currentColor" : "none"} /></button>
          <button className="header-icon support-header-button" aria-label="Support" onClick={() => setProductPanel("support")}><Headphones size={20} /></button>
          {user?.role === "admin" && <button className="header-icon admin-header-button" aria-label="Admin review" onClick={() => setProductPanel("admin")}><ShieldCheck size={20} /></button>}
          <button className="account-button" onClick={() => setProductPanel("account")}><CircleUserRound size={20} /><span>{user ? "Account" : "Sign in"}</span></button>
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={21} /></button>
        </div>
      </header>

      {activeNav === "Homes" && <section className="discovery-bar" aria-label="Search for a long-term home">
        <div className="search-console">
          <label className="console-field destination-field">
            <span>Destination</span>
            <div><MapPin size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchHomes(); }} aria-label="Destination" /></div>
          </label>
          <button className="console-field" onClick={() => setFiltersOpen(true)}><span>Move in</span><strong>{moveIn}</strong></button>
          <button className="console-field" onClick={() => setFiltersOpen(true)}><span>Lease</span><strong>{lease}</strong></button>
          <Button className="primary-search" onClick={() => void searchHomes()}><Search size={19} /><span>Search homes</span></Button>
          <button className="mobile-filter-open" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={19} /><span>Filters</span></button>
        </div>

        <div className="quick-filters">
          <button className="filter-trigger" onClick={() => setFiltersOpen(true)}>Monthly rent <strong>฿{Math.round(price[0] / 1000)}k-{Math.round(price[1] / 1000)}k</strong><ChevronDown size={14} /></button>
          <button className="filter-trigger" onClick={() => setFiltersOpen(true)}>Bedrooms <strong>{bedrooms.length ? bedrooms.join(", ") : "Any"}</strong><ChevronDown size={14} /></button>
          <button className={`filter-trigger ${nearTransit ? "selected" : ""}`} onClick={() => setNearTransit((current) => !current)}><TrainFront size={16} /> Near BTS / MRT</button>
          <button className={`filter-trigger ${noAgentFee ? "selected" : ""}`} onClick={() => setNoAgentFee((current) => !current)}><CircleDollarSign size={16} /> No agent fee</button>
          <button className={`filter-trigger ${verifiedOnly ? "selected" : ""}`} onClick={() => setVerifiedOnly((current) => !current)}><BadgeCheck size={16} /> YUU verified</button>
          <button className="filter-trigger more" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={16} /> All filters <span>{[nearTransit, noAgentFee, verifiedOnly].filter(Boolean).length}</span></button>
        </div>
      </section>}

      <div className={`marketplace-workspace ${activeNav !== "Homes" ? "standalone" : ""}`}>
        <section className={`results-column ${mobileView === "map" ? "mobile-hidden" : ""}`}>
          {activeNav === "Homes" ? <>
          <div className="results-heading">
            <div>
              <p className="breadcrumbs">Thailand / Bangkok / Long stay</p>
              <h1>Bangkok homes for real life</h1>
              <p className="results-count">{savedOnly ? `${visibleListings.length} saved ${visibleListings.length === 1 ? "home" : "homes"}` : `${visibleListings.length} homes available to explore`}</p>
            </div>
            <label className="sort-select">
              <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort homes">
                <option>Best match</option>
                <option>Lowest monthly rent</option>
                <option>Newest homes</option>
              </select>
              <ChevronDown size={15} />
            </label>
          </div>

          <div className="confidence-banner">
            <div className="confidence-icon"><ShieldCheck size={21} /></div>
            <div><strong>Compare the full cost before you visit.</strong><span>Each home shows known costs and the status of its checks.</span></div>
            <button onClick={() => chooseNav("Rental guide")}>Rental guide <ArrowRight size={15} /></button>
          </div>

          {inventoryLoading ? <div className="yuu-list-loading" role="status"><div /><div /><div /><span>Loading homes…</span></div> : inventoryError ? (
            <div className="empty-results"><Building2 size={34} /><h2>Homes are temporarily unavailable</h2><p>{inventoryError}</p><Button onClick={() => { setInventoryLoading(true); setInventoryError(""); setInventoryReload((current) => current + 1); }}>Try again</Button></div>
          ) : visibleListings.length ? (
            <div className="property-list">
              {visibleListings.map((item) => (
                <article
                  className={`property-card ${hovered === item.id ? "is-focused" : ""}`}
                  key={item.id}
                  onMouseEnter={() => setHovered(item.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div
                    className="property-photo"
                    onTouchStart={(event) => beginPhotoSwipe(item, event.touches[0].clientX, event.currentTarget.querySelector("img"))}
                    onTouchMove={(event) => movePhotoSwipe(item, event.touches[0].clientX)}
                    onTouchEnd={(event) => handlePhotoSwipe(item, event.changedTouches[0].clientX)}
                    onTouchCancel={() => cancelPhotoSwipe(item)}
                  >
                    <button className="photo-open" onClick={(event) => { if (swipeDidMove.current[item.id]) { event.preventDefault(); swipeDidMove.current[item.id] = false; return; } setSelected(item); }} aria-label={`Open ${item.title}`}>
                      {item.images.length ? <img src={item.images[imageIndexes[item.id] ?? 0]} alt={`${item.title}, photo ${(imageIndexes[item.id] ?? 0) + 1} of ${item.images.length}`} /> : <span className="yuu-no-photo"><Building2 size={32} /> Photos not added yet</span>}
                    </button>
                    {item.images.length > 1 && <><button className="photo-nav previous" onClick={() => changeImage(item, -1)} aria-label="Previous photo"><ChevronLeft size={18} /></button><button className="photo-nav next" onClick={() => changeImage(item, 1)} aria-label="Next photo"><ChevronRight size={18} /></button></>}
                    <span className="carousel-dots" aria-label="Choose photo">
                      {item.images.map((_, index) => <button key={index} className={(imageIndexes[item.id] ?? 0) === index ? "active" : ""} onClick={() => setImageIndexes((current) => ({ ...current, [item.id]: index }))} aria-label={`Show photo ${index + 1}`} />)}
                    </span>
                  </div>
                  <button
                    className={`save-home ${favorites.includes(item.serverId) ? "saved" : ""}`}
                    onClick={() => toggleFavorite(item.serverId)}
                    aria-label={favorites.includes(item.serverId) ? "Remove from saved homes" : "Save home"}
                  >
                    <Heart size={20} fill={favorites.includes(item.serverId) ? "currentColor" : "none"} />
                  </button>
                  <button className="property-body" onClick={() => setSelected(item)}>
                    <div className="proof-line"><BadgeCheck size={15} /> {item.proof}</div>
                    <div className="property-title-row"><h2>{item.title}</h2></div>
                    <p className="property-address">{item.district}, {item.address}</p>
                    <p className="property-transit"><TrainFront size={16} /> {item.transit}</p>
                    <div className="property-facts"><span>{item.beds} bedroom</span><span>{item.baths} bathroom</span><span>{item.size} m²</span></div>
                    <div className="availability"><Clock3 size={15} /> {item.available}<span>{item.feature}</span></div>
                    <div className="property-price">
                      <div><strong>฿{formatTHB(item.price)}</strong><span> / month</span><small>From ฿{formatTHB(item.price * (1 + item.depositMonths) + (item.oneTimeFeesTHB || 0) + (item.agentFeeTHB || 0))} to move in</small></div>
                      <div className="terms"><span>{item.deposit}</span><span>{item.agentFeeTHB === 0 ? "No agent fee" : item.agentFeeTHB != null ? `฿${formatTHB(item.agentFeeTHB)} agent fee` : "Fees to confirm"}</span></div>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-results"><Building2 size={34} /><h2>{inventory.length ? "No homes match these filters" : "No homes published yet"}</h2><p>{inventory.length ? "Try another Bangkok neighborhood or clear the filters." : "New homes will appear here after owner and listing checks are complete."}</p>{inventory.length > 0 && <Button onClick={() => { setQuery("Bangkok"); setPrice([0, 120000]); setBedrooms([]); setLease("Any lease"); }}>Clear search</Button>}</div>
          )}
          </> : activeNav === "Neighbourhoods" ? (
            <div className="content-page neighbourhoods-page">
              <div className="content-page-header"><span>Bangkok, made easier</span><h1>Choose your neighbourhood</h1><p>Start with the way you want to live, then see homes that fit.</p></div>
              <div className="neighbourhood-grid">
                {[
                  { name: "Asoke", note: "Fast connections and city energy" },
                  { name: "On Nut", note: "More space near the BTS" },
                  { name: "Ari", note: "Cafes, calm streets and creative life" },
                  { name: "Bang Chak", note: "Local pace with quick Sukhumvit access" },
                ].map((area) => <button key={area.name} className="neighbourhood-card" onClick={() => { setQuery(area.name); chooseNav("Homes"); }}><span className="neighbourhood-map-symbol" aria-hidden="true"><MapPin size={24} /></span><span><strong>{area.name}</strong><small>{area.note}</small></span><ArrowRight size={19} /></button>)}
              </div>
              <button className="content-primary-action" onClick={() => { chooseNav("Homes"); setMobileView("map"); }}>Explore on the map <MapIcon size={18} /></button>
            </div>
          ) : activeNav === "Rental guide" ? (
            <div className="content-page guide-page">
              <div className="content-page-header"><span>Rent with context</span><h1>A clearer way to rent in Thailand</h1><p>Know the real move-in cost, check the lease and arrive prepared.</p></div>
              <div className="guide-grid">
                {[
                  ["01", "Budget the full move-in", "Compare rent, deposit and every fee before you commit."],
                  ["02", "Verify the home", "Use checked photos, walkthroughs and owner identity details."],
                  ["03", "Review the lease", "Confirm the English contract, notice period and deposit return terms."],
                  ["04", "Document move-in", "Record the condition of the home before receiving the keys."],
                ].map(([number, title, body]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}
              </div>
              <button className="content-primary-action" onClick={() => chooseNav("Homes")}>Browse verified homes <ArrowRight size={18} /></button>
            </div>
          ) : (
            <div className="content-page owners-page">
              <div className="content-page-header"><span>For owners</span><h1>List once. Rent with confidence.</h1><p>YUU helps serious long-stay renters understand your home before the first viewing.</p></div>
              <div className="owner-layout">
                <div className="owner-photo"><img src="/properties/townhome.jpg" alt="Bright Bangkok home prepared for a long-stay renter" /></div>
                <div className="owner-steps">
                  {[
                    ["Show the real home", "Add accurate photography, video and practical details."],
                    ["Set transparent costs", "Publish rent, deposit and move-in total in one place."],
                    ["Meet qualified renters", "Receive structured viewing requests from long-stay guests."],
                  ].map(([title, body]) => <div key={title}><Check size={18} /><span><strong>{title}</strong><small>{body}</small></span></div>)}
                  <button className="content-primary-action" onClick={() => setProductPanel("owner")}>Start a listing <ArrowRight size={18} /></button>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className={`map-column ${activeNav !== "Homes" ? "section-hidden" : mobileView === "list" ? "mobile-hidden" : ""}`} aria-label="Bangkok rental map">
          <div className="live-map" ref={mapElementRef} />
          <div className="map-result-count"><strong>{visibleListings.length || 0}</strong><span>homes matching search</span></div>
          <div className="map-top-controls">
            <button className={`map-search-action ${mapSearchStatus}`} aria-hidden={mapSearchStatus === "hidden"} tabIndex={mapSearchStatus === "hidden" ? -1 : 0} onClick={() => void searchMapArea()} disabled={mapSearchStatus === "loading" || mapSearchStatus === "updated"}>
              {mapSearchStatus === "loading" ? <LoaderCircle className="map-loader" size={16} /> : mapSearchStatus === "updated" ? <Check size={16} /> : <Search size={16} />}
              {mapSearchStatus === "loading" ? "Searching" : mapSearchStatus === "updated" ? "Area updated" : "Search this area"}
            </button>
            <button className="map-filter-action" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17} /> Filters</button>
          </div>
          <div className="map-control-stack">
            <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in"><Plus size={18} /></button>
            <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out"><Minus size={18} /></button>
            <button onClick={() => { lastSearchCenterRef.current = [13.746, 100.566]; mapSearchStatusRef.current = "hidden"; setMapSearchStatus("hidden"); mapRef.current?.flyTo([13.746, 100.566], 13); showNotice("Centered on Bangkok"); }} aria-label="Center map"><LocateFixed size={18} /></button>
            <button className={mapStyle === "light" ? "active" : ""} onClick={() => setMapStyle((current) => current === "streets" ? "light" : "streets")} aria-label="Change map style"><Layers3 size={18} /></button>
          </div>
          <div className="map-attribution">© OpenStreetMap contributors · CARTO</div>
        </aside>
      </div>

      {activeNav === "Homes" && <div className="mobile-view-switch" role="group" aria-label="Results view">
        <button className={mobileView === "list" ? "active" : ""} onClick={() => setMobileView("list")}><ListFilter size={17} /> List</button>
        <button className={mobileView === "map" ? "active" : ""} onClick={() => { setMobileView("map"); requestAnimationFrame(() => mapRef.current?.invalidateSize()); }}><MapIcon size={17} /> Map</button>
      </div>}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent className="filter-panel sm:max-w-[540px]" side="right">
          <SheetHeader className="panel-header"><SheetTitle>Find your place</SheetTitle><SheetDescription>Location, timing, budget and rental terms in one place.</SheetDescription></SheetHeader>
          <div className="panel-scroll">
            <section className="panel-section global-filter-section">
              <h3>Search basics</h3>
              <label className="drawer-field drawer-field-wide"><span>Destination</span><div><MapPin size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} /></div></label>
              <div className="drawer-field-grid">
                <label className="drawer-field"><span>Move in</span><select value={moveIn} onChange={(event) => setMoveIn(event.target.value as typeof moveIn)}><option>Anytime</option><option>Ready now</option><option>Within 30 days</option></select></label>
                <label className="drawer-field"><span>Lease</span><select value={lease} onChange={(event) => setLease(event.target.value as typeof lease)}><option>Any lease</option><option>6-12 months</option><option>12+ months</option></select></label>
                <label className="drawer-field"><span>Home type</span><select value={propertyType} onChange={(event) => setPropertyType(event.target.value as typeof propertyType)}><option>Any type</option><option>Condo</option><option>Apartment</option><option>House</option></select></label>
                <label className="drawer-field"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option>Best match</option><option>Lowest monthly rent</option><option>Newest homes</option></select></label>
              </div>
            </section>
            <section className="panel-section rent-editor">
              <div className="section-title"><h3>Monthly rent</h3><span>THB per month</span></div>
              <div className="rent-presets" role="group" aria-label="Common monthly rent ranges">
                {[
                  { label: "Under ฿25k", value: [10000, 25000] },
                  { label: "฿25k-40k", value: [25000, 40000] },
                  { label: "฿40k-65k", value: [40000, 65000] },
                  { label: "฿65k+", value: [65000, 120000] },
                ].map((preset) => (
                  <button key={preset.label} className={price[0] === preset.value[0] && price[1] === preset.value[1] ? "active" : ""} onClick={() => setPrice(preset.value)}>{preset.label}</button>
                ))}
              </div>
              <div className="price-inputs">
                <label><span>Minimum</span><div><b>฿</b><input inputMode="numeric" value={price[0]} onChange={(event) => updatePrice(0, event.target.value)} aria-label="Minimum monthly rent" /></div></label>
                <span className="price-separator">to</span>
                <label><span>Maximum</span><div><b>฿</b><input inputMode="numeric" value={price[1]} onChange={(event) => updatePrice(1, event.target.value)} aria-label="Maximum monthly rent" /></div></label>
              </div>
              <div className="market-guide"><span>Typical central Bangkok 1-bedroom</span><strong>฿25k-45k</strong></div>
            </section>
            <section className="panel-section"><h3>Bedrooms</h3><div className="option-grid">
              <button className={bedrooms.length === 0 ? "active" : ""} onClick={() => setBedrooms([])}>Any</button>
              {[1, 2, 3].map((count) => <button key={count} className={bedrooms.includes(count) ? "active" : ""} onClick={() => setBedrooms((current) => current.includes(count) ? current.filter((item) => item !== count) : [...current, count])}>{count === 3 ? "3+" : count}</button>)}
            </div></section>
            <section className="panel-section"><h3>Rental confidence</h3>
              <label className="check-option"><span><strong>YUU verified homes</strong><small>Identity, listing details and media checked</small></span><Checkbox checked={verifiedOnly} onCheckedChange={(value) => setVerifiedOnly(Boolean(value))} /></label>
              <label className="check-option"><span><strong>No agent fee</strong><small>Never pay a hidden broker commission</small></span><Checkbox checked={noAgentFee} onCheckedChange={(value) => setNoAgentFee(Boolean(value))} /></label>
              <label className="check-option"><span><strong>Near BTS / MRT</strong><small>Station within a 15-minute walk</small></span><Checkbox checked={nearTransit} onCheckedChange={(value) => setNearTransit(Boolean(value))} /></label>
            </section>
          </div>
          <div className="panel-actions"><button onClick={() => { setQuery("Bangkok"); setMoveIn("Anytime"); setLease("Any lease"); setPropertyType("Any type"); setSort("Best match"); setPrice([0, 120000]); setBedrooms([]); setVerifiedOnly(false); setNoAgentFee(false); setNearTransit(false); }}>Clear all</button><Button onClick={() => { setFiltersOpen(false); void searchHomes(); }}>Show {visibleListings.length} matching homes</Button></div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="home-panel sm:max-w-[700px]" side="right" showCloseButton={false}>
          {selected && <>
            <div
              className="home-gallery"
              onTouchStart={(event) => beginPhotoSwipe(selected, event.touches[0].clientX, event.currentTarget.querySelector("img"))}
              onTouchMove={(event) => movePhotoSwipe(selected, event.touches[0].clientX)}
              onTouchEnd={(event) => handlePhotoSwipe(selected, event.changedTouches[0].clientX)}
              onTouchCancel={() => cancelPhotoSwipe(selected)}
            >
              {selected.images.length ? <img src={selected.images[imageIndexes[selected.id] ?? 0]} alt={`${selected.title}, photo ${(imageIndexes[selected.id] ?? 0) + 1} of ${selected.images.length}`} /> : <div className="yuu-no-photo"><Building2 size={36} /> Photos not added yet</div>}
              <div className="gallery-actions"><button onClick={() => setSelected(null)} aria-label="Close details"><X size={20} /></button><button onClick={() => toggleFavorite(selected.serverId)} aria-label={favorites.includes(selected.serverId) ? "Remove from saved homes" : "Save home"}><Heart size={20} fill={favorites.includes(selected.serverId) ? "currentColor" : "none"} /></button></div>
              {selected.images.length > 1 && <><button className="detail-photo-nav previous" onClick={() => changeImage(selected, -1)} aria-label="Previous photo"><ChevronLeft size={20} /></button><button className="detail-photo-nav next" onClick={() => changeImage(selected, 1)} aria-label="Next photo"><ChevronRight size={20} /></button></>}
            </div>
            <div className="home-content" ref={homeContentRef}>
              <div className="home-proof"><BadgeCheck size={16} /> {selected.proof}</div>
              <h2>{selected.title}</h2>
              <p className="home-location"><MapPin size={16} /> {selected.district}, {selected.address}</p>
              <div className="home-summary"><span><BedDouble size={18} />{selected.beds} bedroom</span><span><Bath size={18} />{selected.baths} bathroom</span><span><Building2 size={18} />{selected.size} m²</span></div>
              <ListingCostBreakdown cost={selected} trust={selectedTrust?.listingId === selected.serverId ? selectedTrust : null} />
              <ListingTrustPassport listingId={selected.serverId} trust={selectedTrust} error={trustError?.id === selected.serverId ? trustError.message : ""} />
              <DepositReturnChecklist />
              <section className="yuu-mock-payment-entry"><div><strong>Payment flow preview</strong><p>Explore a mock payment with no card details or real charge.</p></div><button disabled={selectedTrust?.listingId !== selected.serverId || !selectedTrust.verified || !selectedTrust.cost.allFeesConfirmed} onClick={() => { setPaymentListing({ id: selected.serverId, title: selected.title }); setSelected(null); setPaymentOpen(true); }}>Try mock payment</button>{(!selectedTrust?.verified || !selectedTrust.cost.allFeesConfirmed) && <small>Available after all checks and fees are confirmed.</small>}</section>
              <section className="home-section"><h3>About this home</h3><p className="yuu-home-description">{selected.description || "Ask the owner for more details about this home."}</p></section>
            </div>
            <div className="home-actions"><div><span>Known move-in subtotal</span><strong>฿{formatTHB(knownMoveInSubtotal(selected))}</strong></div><Button onClick={() => { setViewingListing({ id: selected.serverId, title: selected.title }); setSelected(null); setProductPanel("viewing"); }}><MessageCircle size={18} /> Request a viewing</Button></div>
          </>}
        </SheetContent>
      </Sheet>

      <ProductFlows open={productPanel} onOpenChange={setProductPanel} viewingListing={viewingListing} user={user} onUserChange={setUser} />
      <MockPaymentPanel key={paymentListing?.id ?? "none"} open={paymentOpen} onOpenChange={setPaymentOpen} listing={paymentListing} />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent className="mobile-nav-panel" side="right">
          <SheetHeader className="mobile-menu-header"><div className="menu-brand"><span className="wordmark-symbol"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M9.5 10.5 18 19l8.5-8.5" /><path className="mark-stem" d="M18 19v8" /><circle cx="26.5" cy="10.5" r="2.4" /></svg></span><span><SheetTitle>YUU</SheetTitle><SheetDescription>Thailand long stay</SheetDescription></span></div></SheetHeader>
          <nav className="mobile-nav-links">
            {[
              ["Homes", "Browse verified long-stay rentals"],
              ["Neighbourhoods", "Find the part of Bangkok that fits"],
              ["Rental guide", "Deposits, leases and move-in checks"],
              ["For owners", "List a home with transparent terms"],
            ].map(([item, note]) => <button key={item} className={activeNav === item ? "active" : ""} onClick={() => { chooseNav(item); setMenuOpen(false); }}><span><strong>{item}</strong><small>{note}</small></span><ChevronRight size={19} /></button>)}
          </nav>
          <div className="mobile-menu-actions">
            <button onClick={() => { chooseNav("Homes"); setSavedOnly(true); setMenuOpen(false); }}><Heart size={19} fill={favorites.length ? "currentColor" : "none"} /><span><strong>Saved homes</strong><small>{favorites.length} in your shortlist</small></span><ChevronRight size={18} /></button>
            <button onClick={() => { setMenuOpen(false); setProductPanel("support"); }}><Headphones size={19} /><span><strong>Support</strong><small>Send a request and track its status</small></span><ChevronRight size={18} /></button>
            {user?.role === "admin" && <button onClick={() => { setMenuOpen(false); setProductPanel("admin"); }}><ShieldCheck size={19} /><span><strong>Admin review</strong><small>Moderate new homes</small></span><ChevronRight size={18} /></button>}
            <button className="menu-sign-in" onClick={() => { setMenuOpen(false); setProductPanel("account"); }}><CircleUserRound size={19} /><span><strong>{user ? "Account" : "Sign in"}</strong><small>{user ? "View your requests and settings" : "Keep viewings and favourites synced"}</small></span></button>
          </div>
        </SheetContent>
      </Sheet>

      {notice && <div className={`app-notice ${noticeKind}`} role={noticeKind === "error" ? "alert" : "status"}>{noticeKind === "error" ? <X size={17} /> : <Check size={17} />}{notice}</div>}
    </main>
  );
}
