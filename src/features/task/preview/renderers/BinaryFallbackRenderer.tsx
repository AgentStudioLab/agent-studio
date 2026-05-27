// Fallback for binary files we don't have a dedicated renderer for.
//
// Shows a friendly "can't preview here" notice + a CTA that delegates to
// the host opener (handleOpenExternal from PreviewPane). Future pptx / xlsx
// renderers will replace this for their specific file types.

import { useTranslation } from "react-i18next";
import type { PreviewRendererProps } from "./types";

export function BinaryFallbackRenderer({ onOpenExternal }: PreviewRendererProps) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-8 text-center" style={{ color: "hsl(var(--text-400))" }}>
      <div className="text-[13px] italic">{t("task.preview.binaryNotice")}</div>
      <button
        type="button"
        onClick={onOpenExternal}
        className="mt-3 inline-block rounded-md px-3 py-1.5 text-[12px]"
        style={{
          color: "hsl(var(--text-100))",
          border: "1px solid hsl(var(--border-300) / 0.18)",
        }}
      >
        {t("task.preview.openExternal")}
      </button>
    </div>
  );
}
