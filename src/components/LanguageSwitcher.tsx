import { Languages } from "lucide-react";
import { useLocale } from "@/hooks/useLocale";
import { SUPPORTED_LOCALES, type AppLocale } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

interface Props {
  collapsed?: boolean;
}

export function LanguageSwitcher({ collapsed }: Props) {
  const { locale, setUserLocale } = useLocale();
  const { t } = useTranslation();
  const current = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          aria-label={t("common.language")}
        >
          <Languages className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <span className="flex-1 text-left">
              {current.flag} {current.label}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setUserLocale(l.code as AppLocale)}
            className={l.code === locale ? "bg-accent" : ""}
          >
            <span className="mr-2">{l.flag}</span>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
