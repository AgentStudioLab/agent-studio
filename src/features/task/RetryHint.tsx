import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  delayMs: number;
}

export function RetryHint({ delayMs }: Props) {
  const { t } = useTranslation();
  const sec = Math.max(1, Math.round(delayMs / 1000));
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
      style={{
        borderColor: "var(--warning-100)",
        backgroundColor: "var(--bg-300)",
      }}
    >
      <Clock className="h-4 w-4 shrink-0" style={{ color: "var(--warning-100)" }} />
      <span>{t("task.error.rateLimit", { sec })}</span>
    </div>
  );
}
