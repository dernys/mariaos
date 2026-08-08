import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

export interface SearchableOption {
  value: string;
  label: string;
  hint?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  contentClassName?: string;
  /** Muestra el buscador solo cuando hay muchas opciones (por defecto: siempre) */
  searchThreshold?: number;
  disabled?: boolean;
}

/**
 * Lista desplegable con buscador integrado. Sustituye a <Select> cuando
 * el número de opciones puede crecer (productos, ubicaciones, cuentas...).
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar",
  searchPlaceholder = "Buscar...",
  emptyText = "Sin resultados",
  className,
  contentClassName,
  searchThreshold = 0,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const showSearch = options.length >= searchThreshold;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("h-9 justify-between font-normal text-xs w-full", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-0 w-[--radix-popover-trigger-width] min-w-[220px]", contentClassName)}>
        <Command>
          {showSearch && <CommandInput placeholder={searchPlaceholder} className="h-9 text-xs" />}
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  onSelect={() => { onChange(o.value); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto pl-2 text-[10px] text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
