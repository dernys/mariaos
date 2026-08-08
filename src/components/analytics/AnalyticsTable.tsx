// Tabla analítica con búsqueda, ordenación, paginación y exportación.

import { ReactNode, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/data/TablePagination";
import { ExportButton } from "@/components/data/ExportButton";
import { ChartCard } from "./ChartCard";
import type { ExportColumn } from "@/lib/exportData";

export interface AnalyticsColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Valor numérico/textual usado para ordenar y exportar */
  sortValue?: (row: T) => number | string;
  render: (row: T) => ReactNode;
  exportValue?: (row: T) => string | number;
}

interface Props<T> {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: AnalyticsColumn<T>[];
  searchKeys?: (row: T) => string;
  loading?: boolean;
  filename?: string;
  initialSort?: { key: string; desc?: boolean };
  pageSizeDefault?: number;
  actions?: ReactNode;
}

export function AnalyticsTable<T>({
  title,
  subtitle,
  rows,
  columns,
  searchKeys,
  loading,
  filename,
  initialSort,
  pageSizeDefault = 10,
  actions,
}: Props<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  const [sortKey, setSortKey] = useState(initialSort?.key ?? columns[0]?.key);
  const [desc, setDesc] = useState(initialSort?.desc ?? true);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term && searchKeys ? rows.filter((r) => searchKeys(r).toLowerCase().includes(term)) : rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return base;
    return [...base].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return desc ? bv - av : av - bv;
      return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
  }, [rows, search, searchKeys, columns, sortKey, desc]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const exportColumns: ExportColumn<T>[] = columns.map((c) => ({
    key: c.key,
    label: c.label,
    format: (r: T) => String(c.exportValue ? c.exportValue(r) : c.sortValue ? c.sortValue(r) : ""),
  }));

  return (
    <ChartCard
      title={title}
      subtitle={subtitle ?? `${filtered.length} registro(s)`}
      loading={loading}
      height={180}
      actions={
        <div className="flex items-center gap-2">
          {searchKeys && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar..."
                className="h-8 pl-8 text-xs w-36 sm:w-48"
              />
            </div>
          )}
          {actions}
          {filename && <ExportButton rows={filtered} columns={exportColumns} filename={filename} title={title} />}
        </div>
      }
    >
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    onClick={() => {
                      if (!c.sortValue) return;
                      if (sortKey === c.key) setDesc((d) => !d);
                      else { setSortKey(c.key); setDesc(true); }
                    }}
                    className={`text-[11px] whitespace-nowrap ${c.align === "right" ? "text-right" : ""} ${c.sortValue ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  >
                    <span className={`inline-flex items-center gap-1 ${c.align === "right" ? "justify-end" : ""}`}>
                      {c.label}
                      {sortKey === c.key && c.sortValue && (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-xs text-muted-foreground py-8">
                    Sin datos para los filtros aplicados
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    {columns.map((c) => (
                      <TableCell key={c.key} className={`text-xs ${c.align === "right" ? "text-right" : ""}`}>
                        {c.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </ChartCard>
  );
}
