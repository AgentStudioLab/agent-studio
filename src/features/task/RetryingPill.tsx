import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  attempt: number;
  maxRetries: number;
}

export function RetryingPill({ attempt, maxRetries }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
      style={{
        backgroundColor: "var(--bg-200)",
        color: "var(--text-200)",
      }}
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{t("task.retry.attempt", { attempt, max: maxRetries })}</span>
    </div>
  );
}
