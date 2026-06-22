import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import type { MarketplaceFilterState, Tenant, StorePublic, ProductCategory } from "./types";

interface Props {
  filters: MarketplaceFilterState;
  tenants: Tenant[];
  stores: StorePublic[];
  categories: ProductCategory[];
  onChange: (f: Partial<MarketplaceFilterState>) => void;
  onClear: () => void;
}

const Chip = ({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) => (
  <span className="inline-flex items-center gap-1 h-7 px-3 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
    {children}
    <button onClick={onRemove} className="hover:opacity-70" aria-label="remove">
      <X className="h-3 w-3" />
    </button>
  </span>
);

export const ActiveFilterChips = ({ filters, tenants, stores, categories, onChange, onClear }: Props) => {
  const { t } = useTranslation();
  const chips: React.ReactNode[] = [];

  filters.categories.forEach((c) =>
    chips.push(
      <Chip key={`c-${c}`} onRemove={() => onChange({ categories: filters.categories.filter((x) => x !== c) })}>
        {c}
      </Chip>
    )
  );
  filters.subcategoryIds.forEach((id) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    chips.push(
      <Chip key={`sc-${id}`} onRemove={() => onChange({ subcategoryIds: filters.subcategoryIds.filter((x) => x !== id) })}>
        {cat.name}
      </Chip>
    );
  });
  filters.tenantIds.forEach((id) => {
    const t2 = tenants.find((x) => x.id === id);
    if (!t2) return;
    chips.push(
      <Chip key={`t-${id}`} onRemove={() => onChange({ tenantIds: filters.tenantIds.filter((x) => x !== id) })}>
        {t2.name}
      </Chip>
    );
  });
  filters.storeIds.forEach((id) => {
    const s = stores.find((x) => x.id === id);
    if (!s) return;
    chips.push(
      <Chip key={`s-${id}`} onRemove={() => onChange({ storeIds: filters.storeIds.filter((x) => x !== id) })}>
        📍 {s.name}
      </Chip>
    );
  });
  if (filters.priceMin != null || filters.priceMax != null) {
    chips.push(
      <Chip key="price" onRemove={() => onChange({ priceMin: null, priceMax: null })}>
        ${filters.priceMin ?? 0} – ${filters.priceMax ?? "∞"}
      </Chip>
    );
  }
  if (filters.availability !== "any") {
    chips.push(
      <Chip key="avail" onRemove={() => onChange({ availability: "any" })}>
        {t(`marketplace.availability.${filters.availability}`)}
      </Chip>
    );
  }
  if (filters.delivery !== "any") {
    chips.push(
      <Chip key="deliv" onRemove={() => onChange({ delivery: "any" })}>
        {t(`marketplace.deliveryType.${filters.delivery}`)}
      </Chip>
    );
  }
  if (filters.maxDistanceKm != null) {
    chips.push(
      <Chip key="dist" onRemove={() => onChange({ maxDistanceKm: null })}>
        ≤ {filters.maxDistanceKm} km
      </Chip>
    );
  }
  if (filters.onlyOffers) {
    chips.push(
      <Chip key="offers" onRemove={() => onChange({ onlyOffers: false })}>
        🔥 {t("marketplace.filters.offers")}
      </Chip>
    );
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips}
      <Button variant="ghost" size="sm" className="h-7 text-xs rounded-full" onClick={onClear}>
        {t("marketplace.clearAll")}
      </Button>
    </div>
  );
};
