import { Info, Sun } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface KeepAwakeBannerProps {
  defaultEnabled?: boolean;
}

export function KeepAwakeBanner({ defaultEnabled = true }: KeepAwakeBannerProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(defaultEnabled);
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-2.5">
      <Info className="size-4 text-muted-foreground" />
      <span className="flex-1 text-sm text-muted-foreground">
        {t("scheduled.keepAwake.description")}
      </span>
      <button
        type="button"
        onClick={() => setEnabled((e) => !e)}
        aria-pressed={enabled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
          enabled
            ? "bg-[hsl(var(--accent-100))] text-[hsl(var(--oncolor-100))]"
            : "bg-muted text-foreground hover:bg-muted/80",
        )}
      >
        <Sun className="size-3" />
        {t("scheduled.keepAwake.toggle")}
      </button>
    </div>
  );
}
