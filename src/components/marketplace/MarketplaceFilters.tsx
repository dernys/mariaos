import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTranslation } from "react-i18next";
import type {
  MarketplaceFilterState,
  Tenant,
  StorePublic,
  ProductCategory,
  MarketProduct,
} from "./types";
import { bizIcon } from "./types";
import { useMemo } from "react";

interface Props {
  filters: MarketplaceFilterState;
  onChange: (patch: Partial<MarketplaceFilterState>) => void;
  onClear: () => void;
  products: MarketProduct[];
  tenants: Tenant[];
  stores: StorePublic[];
  categories: ProductCategory[];
  hasGeo: boolean;
  resultsCount: number;
}

const toggle = (arr: string[], v: string) =>
  arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

export const MarketplaceFilters = ({
  filters,
  onChange,
  onClear,
  products,
  tenants,
  stores,
  categories,
  hasGeo,
  resultsCount,
}: Props) => {
  const { t } = useTranslation();

  // Category names from products.category text column (visible offerings)
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => {
      if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [products]);

  // Subcategories: children of categories matching selected text categories (any tenant)
  const subcategoryOptions = useMemo(() => {
    return categories.filter((c) => c.parent_id != null);
  }, [categories]);

  const tenantCounts = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => m.set(p.tenant_id, (m.get(p.tenant_id) ?? 0) + 1));
    return m;
  }, [products]);

  const priceBounds = useMemo(() => {
    if (!products.length) return { min: 0, max: 1000 };
    const prices = products.map((p) => p.price);
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [products]);

  const currentMin = filters.priceMin ?? priceBounds.min;
  const currentMax = filters.priceMax ?? priceBounds.max;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("marketplace.filters.title")}
        </h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
          {t("marketplace.clearAll")}
        </Button>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["categories", "price", "delivery", "businesses"]}
        className="w-full"
      >
        {/* Categories */}
        <AccordionItem value="categories">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.categories")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {categoryOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("marketplace.filters.none")}</p>
              )}
              {categoryOptions.map(([name, count]) => (
                <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={filters.categories.includes(name)}
                    onCheckedChange={() => onChange({ categories: toggle(filters.categories, name) })}
                  />
                  <span className="flex-1 truncate">{name}</span>
                  <span className="text-[10px] text-muted-foreground">({count})</span>
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Subcategories */}
        {subcategoryOptions.length > 0 && (
          <AccordionItem value="subcategories">
            <AccordionTrigger className="text-sm font-medium">
              {t("marketplace.filters.subcategories")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {subcategoryOptions.map((sc) => (
                  <label key={sc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={filters.subcategoryIds.includes(sc.id)}
                      onCheckedChange={() => onChange({ subcategoryIds: toggle(filters.subcategoryIds, sc.id) })}
                    />
                    <span className="flex-1 truncate">{sc.name}</span>
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Price */}
        <AccordionItem value="price">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.price")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-1">
              <Slider
                min={priceBounds.min}
                max={priceBounds.max || 1}
                step={1}
                value={[currentMin, currentMax]}
                onValueChange={(v) => onChange({ priceMin: v[0], priceMax: v[1] })}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>${currentMin}</span>
                <span>${currentMax}</span>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Availability */}
        <AccordionItem value="availability">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.availability")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5">
              {(["any", "in_stock", "low_stock"] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={filters.availability === opt}
                    onChange={() => onChange({ availability: opt })}
                    className="accent-primary"
                  />
                  {t(`marketplace.availability.${opt}`)}
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Delivery type */}
        <AccordionItem value="delivery">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.deliveryType")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5">
              {(["any", "delivery", "pickup"] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="deliveryType"
                    checked={filters.delivery === opt}
                    onChange={() => onChange({ delivery: opt })}
                    className="accent-primary"
                  />
                  {t(`marketplace.deliveryType.${opt}`)}
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Distance */}
        {hasGeo && (
          <AccordionItem value="distance">
            <AccordionTrigger className="text-sm font-medium">
              {t("marketplace.filters.distance")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-1">
                <Slider
                  min={1}
                  max={25}
                  step={1}
                  value={[filters.maxDistanceKm ?? 25]}
                  onValueChange={(v) => onChange({ maxDistanceKm: v[0] })}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filters.maxDistanceKm ? `≤ ${filters.maxDistanceKm} km` : t("marketplace.distanceAny")}</span>
                  <button
                    className="underline"
                    onClick={() => onChange({ maxDistanceKm: null })}
                  >
                    {t("marketplace.clear")}
                  </button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Businesses */}
        <AccordionItem value="businesses">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.businesses")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {tenants.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("marketplace.filters.none")}</p>
              )}
              {tenants.map((tn) => (
                <label key={tn.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={filters.tenantIds.includes(tn.id)}
                    onCheckedChange={() => onChange({ tenantIds: toggle(filters.tenantIds, tn.id) })}
                  />
                  <span className="flex-1 truncate">{bizIcon(tn.business_type)} {tn.name}</span>
                  <span className="text-[10px] text-muted-foreground">({tenantCounts.get(tn.id) ?? 0})</span>
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Stores */}
        {stores.length > 0 && (
          <AccordionItem value="stores">
            <AccordionTrigger className="text-sm font-medium">
              {t("marketplace.filters.stores")}
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {stores.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={filters.storeIds.includes(s.id)}
                      onCheckedChange={() => onChange({ storeIds: toggle(filters.storeIds, s.id) })}
                    />
                    <span className="flex-1 truncate">📍 {s.name}</span>
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Offers */}
        <AccordionItem value="brands">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.brands")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {(() => {
                const m = new Map<string, number>();
                products.forEach((p) => p.brand && m.set(p.brand, (m.get(p.brand) ?? 0) + 1));
                const arr = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
                if (arr.length === 0) {
                  return <p className="text-xs text-muted-foreground">{t("marketplace.filters.none")}</p>;
                }
                return arr.map(([brand, count]) => (
                  <label key={brand} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={filters.brands.includes(brand)}
                      onCheckedChange={() => onChange({ brands: toggle(filters.brands, brand) })}
                    />
                    <span className="flex-1 truncate">{brand}</span>
                    <span className="text-[10px] text-muted-foreground">({count})</span>
                  </label>
                ));
              })()}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="rating">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.minRating")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5">
              {[null, 3, 4, 4.5].map((v) => (
                <label key={String(v)} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="minRating"
                    checked={filters.minRating === v}
                    onChange={() => onChange({ minRating: v })}
                    className="accent-primary"
                  />
                  {v == null ? t("marketplace.filters.anyRating") : `★ ${v}+`}
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="prepTime">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.prepTime")}
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-1.5">
              {[null, 15, 30, 60].map((v) => (
                <label key={String(v)} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="prepTime"
                    checked={filters.maxPrepMinutes === v}
                    onChange={() => onChange({ maxPrepMinutes: v })}
                    className="accent-primary"
                  />
                  {v == null ? t("marketplace.filters.anyTime") : `≤ ${v} min`}
                </label>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="offers">
          <AccordionTrigger className="text-sm font-medium">
            {t("marketplace.filters.offers")}
          </AccordionTrigger>
          <AccordionContent>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={filters.onlyOffers}
                onCheckedChange={(v) => onChange({ onlyOffers: !!v })}
              />
              🔥 {t("marketplace.filters.onlyOffers")}
            </label>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="pt-2 sticky bottom-0 bg-background lg:bg-transparent">
        <p className="text-xs text-muted-foreground text-center">
          {resultsCount} {t("marketplace.results")}
        </p>
      </div>
    </div>
  );
};
