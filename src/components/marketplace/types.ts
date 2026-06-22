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
  | "discount";

export interface MarketplaceFilterState {
  search: string;
  categories: string[];        // category names (text column on products)
  subcategoryIds: string[];    // ids from product_categories
  tenantIds: string[];
  storeIds: string[];
  priceMin: number | null;
  priceMax: number | null;
  availability: AvailabilityFilter;
  delivery: DeliveryFilter;
  maxDistanceKm: number | null;
  onlyOffers: boolean;
  sort: SortKey;
}

export const defaultFilterState: MarketplaceFilterState = {
  search: "",
  categories: [],
  subcategoryIds: [],
  tenantIds: [],
  storeIds: [],
  priceMin: null,
  priceMax: null,
  availability: "any",
  delivery: "any",
  maxDistanceKm: null,
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
