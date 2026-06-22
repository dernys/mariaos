import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import type { SortKey } from "./types";
import { ArrowUpDown } from "lucide-react";

interface Props {
  value: SortKey;
  onChange: (v: SortKey) => void;
  hasGeo: boolean;
}

export const MarketplaceSortSelect = ({ value, onChange, hasGeo }: Props) => {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger className="w-[200px] h-9 rounded-full bg-card">
        <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
        <SelectValue placeholder={t("marketplace.sort.label")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="relevance">{t("marketplace.sort.relevance")}</SelectItem>
        <SelectItem value="price_asc">{t("marketplace.sort.priceAsc")}</SelectItem>
        <SelectItem value="price_desc">{t("marketplace.sort.priceDesc")}</SelectItem>
        {hasGeo && <SelectItem value="nearest">{t("marketplace.sort.nearest")}</SelectItem>}
        <SelectItem value="newest">{t("marketplace.sort.newest")}</SelectItem>
        <SelectItem value="discount">{t("marketplace.sort.discount")}</SelectItem>
        <SelectItem value="rating">{t("marketplace.sort.rating")}</SelectItem>
      </SelectContent>
    </Select>
  );
};
