import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useBrandTheme } from "@/lib/useBrandTheme";

/**
 * Brand-theme picker (the data-brand axis). Mirrors ThemeSegment/LanguageSegment.
 * Options come from the theme registry, so newly-registered themes appear here
 * automatically. The swatch references a primitive var directly — the documented
 * "categorical palette picker" exception to the token discipline.
 */
export function BrandSegment({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { brand, setBrand, themes } = useBrandTheme();
  return (
    <div
      className={cn("inline-flex flex-wrap gap-1 rounded-md bg-muted p-1", className)}
      role="radiogroup"
      aria-label={t("settings.appearance.brand")}
    >
      {themes.map((th) => (
        <button
          key={th.id}
          role="radio"
          aria-checked={brand === th.id}
          onClick={() => setBrand(th.id)}
          className={cn(
            "flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
            brand === th.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span
            aria-hidden
            className="size-3.5 rounded-full"
            style={{ background: `hsl(var(${th.swatch.brand}))` }}
          />
          {t(th.nameKey)}
        </button>
      ))}
    </div>
  );
}
