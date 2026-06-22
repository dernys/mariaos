import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Clock, Store as StoreIcon, Tag, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import type { MarketProduct, Tenant } from "./types";

interface Props {
  value: string;
  onChange: (v: string) => void;
  products: MarketProduct[];
  tenants: Tenant[];
  onSelectProduct?: (p: MarketProduct) => void;
  onSelectTenant?: (t: Tenant) => void;
  onSelectCategory?: (cat: string) => void;
}

const HISTORY_KEY = "mp:search:history";

export const MarketplaceSearchBar = ({
  value,
  onChange,
  products,
  tenants,
  onSelectProduct,
  onSelectTenant,
  onSelectCategory,
}: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return { products: [], tenants: [], categories: [] };
    const prod = products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
    const ten = tenants.filter((tn) => tn.name.toLowerCase().includes(q)).slice(0, 4);
    const catSet = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.toLowerCase().includes(q)) catSet.add(p.category);
    });
    return { products: prod, tenants: ten, categories: Array.from(catSet).slice(0, 4) };
  }, [q, products, tenants]);

  const saveHistory = (s: string) => {
    const v = s.trim();
    if (!v) return;
    const next = [v, ...history.filter((h) => h !== v)].slice(0, 5);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const showPopover = focused && (q.length > 0 || history.length > 0);

  return (
    <Popover open={showPopover} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { saveHistory(value); setFocused(false); }
              if (e.key === "Escape") setFocused(false);
            }}
            placeholder={t("marketplace.searchPlaceholderRich")}
            className="pl-10 pr-10 h-11 bg-card border-border rounded-full shadow-sm focus-visible:ring-primary"
          />
          {value && (
            <button
              onClick={() => onChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="clear"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <kbd className="hidden md:inline-flex absolute right-12 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">/</kbd>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0 mt-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {!q && history.length > 0 && (
              <CommandGroup heading={t("marketplace.search.recent")}>
                {history.map((h) => (
                  <CommandItem
                    key={h}
                    onSelect={() => { onChange(h); setFocused(false); }}
                    className="gap-2"
                  >
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {h}
                  </CommandItem>
                ))}
                <button
                  onClick={clearHistory}
                  className="w-full text-left px-2 py-1.5 text-[11px] text-muted-foreground hover:underline"
                >
                  {t("marketplace.search.clearHistory")}
                </button>
              </CommandGroup>
            )}
            {q && (
              <>
                {suggestions.products.length === 0 && suggestions.tenants.length === 0 && suggestions.categories.length === 0 && (
                  <CommandEmpty>{t("marketplace.search.noMatch")}</CommandEmpty>
                )}
                {suggestions.products.length > 0 && (
                  <CommandGroup heading={t("marketplace.search.products")}>
                    {suggestions.products.map((p) => (
                      <CommandItem
                        key={p.id}
                        onSelect={() => {
                          saveHistory(p.name);
                          onSelectProduct?.(p);
                          setFocused(false);
                        }}
                        className="gap-2"
                      >
                        <Package className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="text-xs text-primary font-semibold">${p.price.toFixed(2)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {suggestions.tenants.length > 0 && (
                  <CommandGroup heading={t("marketplace.search.businesses")}>
                    {suggestions.tenants.map((tn) => (
                      <CommandItem
                        key={tn.id}
                        onSelect={() => { onSelectTenant?.(tn); setFocused(false); }}
                        className="gap-2"
                      >
                        <StoreIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {tn.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {suggestions.categories.length > 0 && (
                  <CommandGroup heading={t("marketplace.search.categories")}>
                    {suggestions.categories.map((c) => (
                      <CommandItem
                        key={c}
                        onSelect={() => { onSelectCategory?.(c); setFocused(false); }}
                        className="gap-2"
                      >
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {c}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
