import { Package, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface Props {
  hasActiveFilters: boolean;
  onClear: () => void;
}

export const EmptyState = ({ hasActiveFilters, onClear }: Props) => {
  const { t } = useTranslation();
  return (
    <div className="text-center py-20 text-muted-foreground">
      <div className="h-20 w-20 mx-auto mb-4 rounded-2xl bg-muted/40 flex items-center justify-center">
        {hasActiveFilters ? (
          <SearchX className="h-10 w-10 opacity-60" />
        ) : (
          <Package className="h-10 w-10 opacity-60" />
        )}
      </div>
      <h3 className="text-xl font-semibold text-foreground">
        {t("marketplace.noProducts")}
      </h3>
      <p className="text-sm mt-1 max-w-sm mx-auto">
        {hasActiveFilters ? t("marketplace.tryFilters") : t("marketplace.emptyHint")}
      </p>
      {hasActiveFilters && (
        <Button variant="outline" className="mt-4 rounded-full" onClick={onClear}>
          {t("marketplace.clearFilters")}
        </Button>
      )}
    </div>
  );
};
