import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  onConfigureClick: () => void;
}

export function ApiKeyMissingBanner({ onConfigureClick }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
      style={{
        borderColor: "var(--danger-100)",
        backgroundColor: "var(--bg-300)",
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--danger-100)" }} />
      <span className="flex-1">{t("task.error.authFailed")}</span>
      <Button size="sm" variant="outline" onClick={onConfigureClick}>
        {t("task.error.configureKey")}
      </Button>
    </div>
  );
}
