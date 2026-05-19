import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "all",
  "productivity",
  "research",
  "development",
  "communication",
  "design",
  "data",
] as const;
type Category = (typeof CATEGORIES)[number];

interface PluginCategoryChipsProps {
  active: Category;
  onChange: (c: Category) => void;
}

export function PluginCategoryChips({ active, onChange }: PluginCategoryChipsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            active === c
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {t(`customize.plugins.categories.${c}`)}
        </button>
      ))}
    </div>
  );
}

export { CATEGORIES };
export type { Category };
