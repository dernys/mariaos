import { useMemo, useState } from "react";

export type Filters = Record<string, string>;

interface Options<T> {
  data: T[];
  searchKeys: (keyof T | string)[];
  initialPageSize?: number;
  filterFns?: Record<string, (item: T, value: string) => boolean>;
}

function getValue<T>(item: T, key: string): string {
  const parts = key.split(".");
  let v: any = item;
  for (const p of parts) v = v?.[p];
  return v == null ? "" : String(v);
}

export function useTableState<T>({ data, searchKeys, initialPageSize = 10, filterFns = {} }: Options<T>) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((item) => {
      if (q) {
        const match = searchKeys.some((k) => getValue(item, String(k)).toLowerCase().includes(q));
        if (!match) return false;
      }
      for (const [k, v] of Object.entries(filters)) {
        if (!v || v === "__all__") continue;
        const fn = filterFns[k];
        if (fn) {
          if (!fn(item, v)) return false;
        } else {
          if (getValue(item, k) !== v) return false;
        }
      }
      return true;
    });
  }, [data, search, filters, searchKeys, filterFns]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  );

  return {
    search, setSearch: (v: string) => { setSearch(v); setPage(1); },
    filters, setFilter,
    page: safePage, setPage,
    pageSize, setPageSize,
    total,
    filtered,
    paged,
  };
}
