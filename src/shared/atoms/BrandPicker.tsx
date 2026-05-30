import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useBrandTheme } from "@/lib/useBrandTheme";

/**
 * Brand-theme picker — one frosted-glass card per registered theme, each with
 * a radial glow in THAT theme's brand color. The card surface uses mode-aware
 * tokens (--bg-overlay), so it previews the brand against the current light/dark
 * mode automatically. Options come from the registry, so new themes appear here
 * on their own.
 *
 * The glow / name / check use the theme's brand *primitive* directly — the
 * documented "categorical palette picker" exception to the token discipline.
 * Each glow stays monochromatic (one brand hue, no purple) per the anti-slop rule.
 */
export function BrandPicker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { brand, setBrand, themes } = useBrandTheme();
  return (
    <div
      className={cn("flex flex-wrap gap-3", className)}
      role="radiogroup"
      aria-label={t("settings.appearance.brand")}
    >
      {themes.map((th) => {
        const selected = brand === th.id;
        const brandColor = `hsl(var(${th.swatch.brand}))`;
        return (
          <button
            key={th.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setBrand(th.id)}
            className={cn(
              "group relative h-[112px] w-[184px] overflow-hidden rounded-xl border text-left backdrop-blur-xl transition",
              selected
                ? "border-transparent"
                : "border-[hsl(var(--border-300)/0.2)] hover:border-[hsl(var(--border-300)/0.4)]",
            )}
            style={{
              background: "hsl(var(--bg-overlay) / 0.5)",
              boxShadow: selected ? `0 0 0 2px ${brandColor}` : undefined,
            }}
          >
            {/* Brand radial glow — blooms from the lower-center, behind the name. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(115% 80% at 50% 72%, ${brandColor} 0%, transparent 68%)`,
                opacity: 0.5,
              }}
            />
            <span
              className="absolute inset-x-0 bottom-3 text-center text-[15px] font-semibold"
              style={{ color: brandColor }}
            >
              {t(th.nameKey)}
            </span>
            {selected && (
              <span
                aria-hidden
                className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full"
                style={{ background: brandColor, color: "hsl(var(--oncolor-100))" }}
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
