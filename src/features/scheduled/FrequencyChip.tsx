import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Frequency } from "@/lib/data/types";

interface FrequencyChipProps {
  frequency: Frequency;
  timeOfDay?: string;
  className?: string;
}

export function FrequencyChip({ frequency, timeOfDay, className }: FrequencyChipProps) {
  const { t } = useTranslation();
  const hasTime =
    !!timeOfDay && frequency !== "manual" && frequency !== "hourly";

  let label: string;
  if (hasTime) {
    const key =
      frequency === "daily"
        ? "scheduled.frequencyChip.dailyAt"
        : frequency === "weekdays"
          ? "scheduled.frequencyChip.weekdaysAt"
          : "scheduled.frequencyChip.weeklyAt";
    label = t(key, { time: timeOfDay });
  } else {
    label = t(`scheduled.frequencyChip.${frequency}`);
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs",
        "bg-[hsl(var(--success-100)/0.15)] text-[hsl(var(--success-100))]",
        className,
      )}
    >
      <Clock className="size-3" />
      {label}
    </span>
  );
}
