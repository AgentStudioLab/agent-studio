import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/useLanguage";
import type { Language } from "@/i18n";

export function LanguageSegment({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const options: Array<{ value: Language; label: string }> = [
    { value: "zh", label: t("settings.appearance.languageZh") },
    { value: "en", label: t("settings.appearance.languageEn") },
  ];
  return (
    <div
      className={cn("inline-flex rounded-md bg-muted p-1", className)}
      role="radiogroup"
      aria-label={t("settings.appearance.language")}
    >
      {options.map(({ value, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={language === value}
          onClick={() => setLanguage(value)}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm transition-colors",
            language === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
