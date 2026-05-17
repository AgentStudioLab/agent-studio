import { Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeMode } from "@/lib/useThemeMode";

export function ThemeSegment({ className }: { className?: string }) {
  const { pref, setPref } = useThemeMode();
  return (
    <div className={cn("inline-flex p-1 bg-muted rounded-md", className)} role="radiogroup">
      {[
        { value: "system" as const, icon: Monitor, label: "跟随系统" },
        { value: "light" as const, icon: Sun, label: "明亮" },
        { value: "dark" as const, icon: Moon, label: "暗黑" },
      ].map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={pref === value}
          aria-label={label}
          onClick={() => setPref(value)}
          className={cn(
            "flex items-center gap-1 px-3 py-1.5 text-sm rounded-sm transition-colors",
            pref === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
