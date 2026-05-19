import { Monitor, Sun, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useThemeMode } from "@/lib/useThemeMode";

export function ThemeSegment({ className }: { className?: string }) {
  const { pref, setPref } = useThemeMode();
  const { t } = useTranslation();
  const options = [
    { value: "system" as const, icon: Monitor, label: t("settings.appearance.themeSystem") },
    { value: "light" as const, icon: Sun, label: t("settings.appearance.themeLight") },
    { value: "dark" as const, icon: Moon, label: t("settings.appearance.themeDark") },
  ];
  return (
    <div className={cn("inline-flex rounded-md bg-muted p-1", className)} role="radiogroup">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          onClick={() => setPref(value)}
          className={cn(
            "flex items-center gap-1 rounded-sm px-3 py-1.5 text-sm transition-colors",
            pref === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
