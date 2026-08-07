// Sprint C — Paginación, búsqueda y filtrado server-side sobre PostgREST.
// Sustituye el patrón "traer toda la tabla y filtrar en memoria" (useTableState).

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ServerFilterFn = (query: any, value: string) => any;

interface Options {
  /** Nombre de la tabla o vista en la base de datos */
  table: string;
  /** Columnas a proyectar (evita `*` en listados grandes) */
  select?: string;
  /** Columnas usadas por el buscador (ilike, unidas con OR) */
  searchColumns?: string[];
  /** Filtros declarativos: clave → función que aplica el predicado */
  filterFns?: Record<string, ServerFilterFn>;
  /** Orden por defecto */
  orderBy?: { column: string; ascending?: boolean };
  initialPageSize?: number;
  /** Predicados fijos siempre aplicados (p. ej. scope por tienda) */
  baseFilter?: ServerFilterFn;
  enabled?: boolean;
  /** Clave extra para invalidar/segmentar la caché */
  scope?: unknown;
}

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useServerTable<T = Record<string, unknown>>({
  table,
  select = "*",
  searchColumns = [],
  filterFns = {},
  orderBy,
  initialPageSize = 25,
  baseFilter,
  enabled = true,
  scope,
}: Options) {
  const qc = useQueryClient();
  const [search, setSearchRaw] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const debouncedSearch = useDebounced(search);

  const activeFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== "__all__")),
    [filters],
  );

  const query = useQuery({
    queryKey: [
      "server-table",
      table,
      select,
      scope ?? null,
      debouncedSearch,
      activeFilters,
      page,
      pageSize,
      orderBy?.column ?? null,
      orderBy?.ascending ?? true,
    ],
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async () => {
      let q: any = supabase.from(table as never).select(select, { count: "exact" });
      if (baseFilter) q = baseFilter(q, "");
      const term = debouncedSearch.trim();
      if (term && searchColumns.length) {
        q = q.or(searchColumns.map((c) => `${c}.ilike.%${term.replace(/[%,]/g, "")}%`).join(","));
      }
      for (const [key, value] of Object.entries(activeFilters)) {
        const fn = filterFns[key];
        q = fn ? fn(q, value) : q.eq(key, value);
      }
      if (orderBy) q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      const from = (page - 1) * pageSize;
      const { data, error, count } = await q.range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as T[], total: count ?? 0 };
    },
  });

  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return {
    rows: query.data?.rows ?? [],
    total,
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error as Error | null,
    refetch: query.refetch,
    invalidate: () => qc.invalidateQueries({ queryKey: ["server-table", table] }),
    search,
    setSearch: (v: string) => { setSearchRaw(v); setPage(1); },
    filters,
    setFilter: (key: string, value: string) => { setFilters((p) => ({ ...p, [key]: value })); setPage(1); },
    page,
    setPage,
    pageSize,
    setPageSize,
  };
}

/**
 * Agregados ligeros para las tarjetas de resumen: proyecta solo columnas
 * numéricas del tenant, sin traer las filas completas del listado.
 */
export function useTableStats<T = Record<string, number>>(
  table: string,
  select: string,
  options?: { enabled?: boolean; scope?: unknown; baseFilter?: ServerFilterFn },
) {
  return useQuery({
    queryKey: ["table-stats", table, select, options?.scope ?? null],
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    queryFn: async () => {
      let q: any = supabase.from(table as never).select(select);
      if (options?.baseFilter) q = options.baseFilter(q, "");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    },
  });
}
