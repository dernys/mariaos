import { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
}

interface TableToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  rightSlot?: ReactNode;
}

export function TableToolbar({ search, onSearchChange, searchPlaceholder = "Buscar...", filters = [], rightSlot }: TableToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center flex-wrap">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 text-xs"
        />
      </div>
      {filters.map((f) => (
        <SearchableSelect
          key={f.key}
          className="w-full sm:w-44"
          placeholder={f.label}
          searchPlaceholder={`${f.label}...`}
          value={f.value === "__all__" ? "__all__" : f.value}
          onChange={f.onChange}
          options={[{ value: "__all__", label: `${f.label}: Todos` }, ...f.options]}
        />
      ))}
      {rightSlot && <div className="flex items-center gap-2 sm:ml-auto">{rightSlot}</div>}
    </div>
  );
}
