export interface MarketProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  image_url: string | null;
  online_stock: number;
  tenant_id: string;
  is_deliverable: boolean | null;
  sku: string | null;
  warehouse_id: string | null;
  store_id?: string | null;
  brand?: string | null;
  prep_minutes?: number | null;
  rating_avg?: number | null;
  reviews_count?: number | null;
  created_at?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug?: string | null;
  logo_url?: string | null;
  business_type: string;
}

export interface StorePublic {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
}

export interface ProductCategory {
  id: string;
  name: string;
  parent_id: string | null;
  tenant_id: string;
  is_active: boolean;
}

export interface Promotion {
  id: string;
  tenant_id: string;
  name: string;
  promo_type: string;
  discount_value: number;
  scope: string;
  scope_id: string | null;
  scope_value: string | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export interface ProductReview {
  id: string;
  tenant_id: string;
  product_id: string;
  customer_id: string | null;
  user_id: string | null;
  rating: number;
  title: string | null;
  comment: string | null;
  is_verified_purchase: boolean;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItem extends MarketProduct {
  qty: number;
  tenantName: string;
}

export type DeliveryFilter = "any" | "delivery" | "pickup";
export type AvailabilityFilter = "any" | "in_stock" | "low_stock";
export type SortKey =
  | "relevance"
  | "price_asc"
  | "price_desc"
  | "nearest"
  | "newest"
  | "discount"
  | "rating";

export interface MarketplaceFilterState {
  search: string;
  categories: string[];
  subcategoryIds: string[];
  tenantIds: string[];
  storeIds: string[];
  brands: string[];
  priceMin: number | null;
  priceMax: number | null;
  availability: AvailabilityFilter;
  delivery: DeliveryFilter;
  maxDistanceKm: number | null;
  minRating: number | null;
  maxPrepMinutes: number | null;
  onlyOffers: boolean;
  sort: SortKey;
}

export const defaultFilterState: MarketplaceFilterState = {
  search: "",
  categories: [],
  subcategoryIds: [],
  tenantIds: [],
  storeIds: [],
  brands: [],
  priceMin: null,
  priceMax: null,
  availability: "any",
  delivery: "any",
  maxDistanceKm: null,
  minRating: null,
  maxPrepMinutes: null,
  onlyOffers: false,
  sort: "relevance",
};

export const bizIcon = (type: string) => {
  if (type === "restaurante") return "🍽️";
  if (type === "bar") return "🍸";
  if (type === "empresa") return "🏬";
  return "🏪";
};

export const distanceKm = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
};

export const formatPrice = (value: number, currency = "CUP") => {
  try {
    return new Intl.NumberFormat("es-CU", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};
