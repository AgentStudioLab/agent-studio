import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Frequency } from "@/lib/mock/types";

const FREQ_LABEL: Record<Frequency, string> = {
  manual: "Manual",
  hourly: "Every hour",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
};

interface FrequencyChipProps {
  frequency: Frequency;
  timeOfDay?: string;
  className?: string;
}

export function FrequencyChip({ frequency, timeOfDay, className }: FrequencyChipProps) {
  const label =
    timeOfDay && frequency !== "manual" && frequency !== "hourly"
      ? `${FREQ_LABEL[frequency]} at ${timeOfDay}`
      : FREQ_LABEL[frequency];
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
