import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSkillFileContent } from "@/lib/agui/react/useSkillFiles";
import { fileExt, supportsModeToggle } from "./ext";
import {
  SkillFilePreviewHeader,
  type FilePreviewMode,
} from "./SkillFilePreviewHeader";
import { SkillFilePreviewBody } from "./SkillFilePreviewBody";

interface SkillFilePreviewProps {
  skillId: string;
  /** Relative path inside the skill directory. */
  relPath: string;
}

/**
 * Right-pane container shown when the user picks a file from SkillFileTree.
 * Owns the preview/source mode + copy feedback state, fetches content via
 * useSkillFileContent, and delegates rendering to SkillFilePreviewBody.
 *
 * Mode is reset to "preview" whenever the file changes — different file
 * types support different mode sets, and a stale "source" mode on a code
 * file (which doesn't show the toggle) would be confusing if the user later
 * switches to an HTML file.
 */
export function SkillFilePreview({ skillId, relPath }: SkillFilePreviewProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useSkillFileContent(
    skillId,
    relPath,
  );
  const [mode, setMode] = useState<FilePreviewMode>("preview");
  const [copied, setCopied] = useState(false);

  // Reset mode + copy badge whenever the user picks a different file. The
  // effect intentionally keys off the path string identity so re-clicking
  // the same file (e.g. refetch) doesn't churn the preview state.
  useEffect(() => {
    setMode("preview");
    setCopied(false);
  }, [skillId, relPath]);

  const ext = fileExt(relPath);
  const showModeToggle = supportsModeToggle(ext);
  const copyEnabled = data?.encoding === "utf8";
  const name = relPath.split("/").pop() ?? relPath;

  const handleCopy = () => {
    if (!data || data.encoding !== "utf8") return;
    void navigator.clipboard
      .writeText(data.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch((err: unknown) => {
        console.error("[SkillFilePreview] copy failed", err);
      });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <SkillFilePreviewHeader
        name={name}
        showModeToggle={showModeToggle}
        mode={mode}
        onModeChange={setMode}
        copyEnabled={copyEnabled}
        copied={copied}
        onCopy={handleCopy}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t("task.preview.loading")}
          </div>
        )}
        {isError && (
          <div className="px-4 py-6 text-sm text-destructive-foreground">
            {(error as Error | undefined)?.message ?? "load failed"}
          </div>
        )}
        {data && <SkillFilePreviewBody relPath={relPath} data={data} mode={mode} />}
      </div>
    </div>
  );
}
