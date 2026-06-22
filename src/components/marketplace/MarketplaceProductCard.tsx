import { motion } from "framer-motion";
import { Plus, Minus, MapPin, Truck, Tag, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { bizIcon, formatPrice } from "./types";
import { RatingStars } from "./RatingStars";
import type { MarketProduct, Tenant } from "./types";

interface Props {
  product: MarketProduct;
  tenant?: Tenant;
  distanceKm?: number;
  discountPct?: number;
  qtyInCart: number;
  isNew?: boolean;
  index?: number;
  onAdd: () => void;
  onRemove: () => void;
}

export const MarketplaceProductCard = ({
  product,
  tenant,
  distanceKm,
  discountPct = 0,
  qtyInCart,
  isNew,
  index = 0,
  onAdd,
  onRemove,
}: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const finalPrice = discountPct > 0 ? product.price * (1 - discountPct / 100) : product.price;
  const stockState =
    product.online_stock <= 0
      ? "out"
      : product.online_stock <= 5
      ? "low"
      : "ok";

  const goDetail = () => navigate(`/marketplace/p/${product.id}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.3) }}
      className="bg-card rounded-2xl border border-border overflow-hidden group hover:shadow-lg hover:border-primary/30 transition-all flex flex-col"
    >
      <button
        onClick={goDetail}
        className="aspect-square bg-gradient-to-br from-primary/5 to-accent/10 relative overflow-hidden text-left"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl opacity-50">
            {tenant ? bizIcon(tenant.business_type) : "📦"}
          </div>
        )}

        {/* Top-left badges */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {discountPct > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold shadow">
              -{Math.round(discountPct)}%
            </span>
          )}
          {isNew && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shadow">
              {t("marketplace.badge.new")}
            </span>
          )}
          {product.is_deliverable !== false && (
            <span className="px-1.5 py-0.5 rounded-full bg-card/90 backdrop-blur text-foreground text-[10px] font-medium border border-border flex items-center gap-1">
              <Truck className="h-2.5 w-2.5" /> {t("marketplace.badge.delivery")}
            </span>
          )}
        </div>

        {/* Top-right stock */}
        <div className="absolute top-2 right-2">
          {stockState === "low" && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/95 text-white text-[10px] font-semibold shadow">
              {t("marketplace.stock.last", { n: product.online_stock })}
            </span>
          )}
          {stockState === "ok" && qtyInCart > 0 && (
            <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow">
              {qtyInCart}
            </span>
          )}
        </div>
      </button>

      <div className="p-3 space-y-1.5 flex-1 flex flex-col">
        {tenant && (
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide truncate flex items-center gap-1">
            <span className="truncate">{bizIcon(tenant.business_type)} {tenant.name}</span>
            {distanceKm != null && (
              <span className="text-primary font-semibold whitespace-nowrap inline-flex items-center gap-0.5">
                · <MapPin className="h-2.5 w-2.5" /> {distanceKm.toFixed(1)} km
              </span>
            )}
          </p>
        )}
        <h3
          onClick={goDetail}
          className="text-sm font-semibold text-foreground line-clamp-2 leading-tight cursor-pointer hover:text-primary"
        >
          {product.name}
        </h3>
        {product.category && (
          <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Tag className="h-2.5 w-2.5" /> {product.category}
          </p>
        )}

        <div className="flex items-end justify-between pt-1 mt-auto">
          <div className="leading-none">
            {discountPct > 0 && (
              <p className="text-[11px] text-muted-foreground line-through">
                {formatPrice(product.price)}
              </p>
            )}
            <span className="text-base font-bold text-primary">{formatPrice(finalPrice)}</span>
          </div>
          {qtyInCart > 0 ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onRemove}
                className="h-7 w-7 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="text-sm font-bold w-5 text-center">{qtyInCart}</span>
              <button
                onClick={onAdd}
                disabled={qtyInCart >= product.online_stock}
                className="h-7 w-7 rounded-full bg-primary text-primary-foreground hover:opacity-90 flex items-center justify-center disabled:opacity-40"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={onAdd}
              disabled={stockState === "out"}
              className="h-8 w-8 p-0 rounded-full"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
