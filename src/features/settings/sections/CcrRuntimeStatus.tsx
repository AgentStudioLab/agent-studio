import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CcrRuntimeApplyError,
  applyCcrRuntimeRoutes,
  type CcrRuntimeStatus as CcrRuntimeStatusData,
  type ProviderState,
} from "@/lib/data/settings";

interface CcrRuntimeStatusProps {
  status?: CcrRuntimeStatusData;
}

function statusMessage(
  status: CcrRuntimeStatusData,
  t: ReturnType<typeof useTranslation>["t"],
): string | null {
  if (status.phase === "empty") return null;
  if (status.phase === "ready") {
    return t("settings.provider.ccrReady", { count: status.routeCount });
  }
  if (status.phase === "applying") {
    return t("settings.provider.ccrApplying");
  }
  if (status.phase === "disabled") {
    return t("settings.provider.ccrDisabled");
  }
  return t("settings.provider.ccrError", {
    message: status.lastError ?? "unknown",
  });
}

export function CcrRuntimeStatus({ status }: CcrRuntimeStatusProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  if (!status) return null;

  const message = statusMessage(status, t);
  if (!message) return null;

  const canRetry = status.phase === "error";

  const retry = async () => {
    setRetrying(true);
    try {
      await applyCcrRuntimeRoutes();
      void qc.invalidateQueries({ queryKey: ["provider"] });
    } catch (err) {
      if (err instanceof CcrRuntimeApplyError && err.ccrStatus) {
        qc.setQueryData<ProviderState>(["provider"], (current) =>
          current ? { ...current, ccrStatus: err.ccrStatus } : current,
        );
        return;
      }
      throw err;
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2 text-sm">
      <p className="min-w-0 text-muted-foreground">{message}</p>
      {canRetry && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => void retry()}
          disabled={retrying}
        >
          <RefreshCw />
          {t("settings.provider.ccrRetry")}
        </Button>
      )}
    </div>
  );
}
