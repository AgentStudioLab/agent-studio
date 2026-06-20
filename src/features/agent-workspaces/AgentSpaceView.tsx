import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { PageColumn } from "@/shared/layout/PageColumn";
import { useAppShell } from "@/app/AppShellContext";
import { useAgentWorkspace } from "@/lib/data/agent-queries";
import { createConversation } from "@/lib/data/conversations";
import { queryKeys } from "@/lib/data/queries";
import { threadStatusKey } from "@/lib/agui/react/useChat";
import { agentMemoryKeys } from "@/lib/data/agent-memory-tree-queries";
import { useAvailableModels } from "@/lib/models";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { SlashEditor } from "@/features/composer/SlashEditor";
import { ModelPicker } from "@/features/task/ModelPicker";
import { AgentSpaceHeader } from "@/features/agent-workspaces/AgentSpaceHeader";
import { AgentRecents } from "@/features/agent-workspaces/AgentRecents";
import { InstructionsCard } from "@/features/agent-workspaces/InstructionsCard";
import { ScheduledRailCard } from "@/features/agent-workspaces/ScheduledRailCard";
import { SkillsRailCard } from "@/features/agent-workspaces/SkillsRailCard";
import { ContextCard } from "@/features/agent-workspaces/ContextCard";
import { PreviewPane } from "@/features/task/PreviewPane";
import type { MockFile } from "@/lib/mock/types";

export function AgentSpaceView() {
  const { agentId } = useParams<{ agentId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setPendingFirstPrompt } = useAppShell();
  const { defaultModelId } = useAvailableModels();
  const { data: agent } = useAgentWorkspace(agentId ?? null);
  const [model, setModel] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // File preview opened from a Context folder tree. workingDir = the mounted
  // folder's path (the /files/content sandbox cwd) so files under it resolve.
  const [preview, setPreview] = useState<{ file: MockFile; workingDir: string } | null>(null);

  // Memory files change server-side when the agent runs (the `remember` tool in
  // TaskView or a scheduled run), so the cached tree + open preview go stale
  // after a round-trip. Re-entering the agent space — or refocusing the window —
  // invalidates both so the latest shows without the preview's manual refresh.
  // (invalidate refetches active observers regardless of useFileContent's
  // staleTime:Infinity, leaving its manual-refresh default intact for TaskView.)
  useEffect(() => {
    if (!agentId) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: agentMemoryKeys.tree(agentId) });
      void qc.invalidateQueries({ queryKey: ["file-content"] });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [agentId, qc]);

  const handleSubmit = async ({ text }: PromptInputMessage) => {
    if (!agentId || !agent || text.trim().length === 0 || submitting) return;
    setSubmitting(true);
    try {
      // Bound conversation → backend sets working_dir = agent home dir.
      const conv = await createConversation({
        title: t("newTask.defaultTitle"),
        agentWorkspaceId: agentId,
      });
      void qc.invalidateQueries({ queryKey: queryKeys.recents });
      void qc.invalidateQueries({ queryKey: threadStatusKey });
      setPendingFirstPrompt({
        conversationId: conv.id,
        text,
        permissionMode: "ask",
        model: model ?? defaultModelId ?? undefined,
      });
      navigate(`/task/${conv.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      main={
        <div className="relative flex min-h-0 flex-1">
          {/* Left: fixed header + composer, with only the recents list scrolling. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* 顶部紧贴 macOS 标题栏；标记为拖拽区，保证详情页顶部空白也能拖动窗口。 */}
            <div
              data-tauri-drag-region
              className="px-4 pb-4 pt-2 sm:px-8 sm:pt-2 lg:px-12"
            >
              <PageColumn className="max-w-[860px]">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  aria-label={t("agentSpace.back")}
                >
                  <ChevronLeft className="size-4" />
                  {t("agentSpace.back")}
                </button>
                {agent ? (
                  <AgentSpaceHeader agent={agent} />
                ) : (
                  <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
                    {t("agentSpace.notFound")}
                  </h1>
                )}
              </PageColumn>
            </div>
            <div className="px-4 pb-8 sm:px-8 lg:px-12">
              <PageColumn className="max-w-[860px]">
                <div className="rounded-2xl bg-background">
                  <PromptInput onSubmit={handleSubmit}>
                    <SlashEditor placeholder={t("agentSpace.promptPlaceholder")} />
                    <PromptInputFooter className="px-4 pb-3">
                      <PromptInputTools />
                      <PromptInputTools>
                        <ModelPicker value={model} onChange={setModel} />
                        <PromptInputSubmit />
                      </PromptInputTools>
                    </PromptInputFooter>
                  </PromptInput>
                </div>
              </PageColumn>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-8 lg:px-12">
              <PageColumn className="max-w-[860px]">
                {agentId && <AgentRecents agentId={agentId} />}
              </PageColumn>
            </div>
          </div>

          {/* Right rail: Instructions / Scheduled / Context */}
          {agentId && (
            <aside className="flex w-[340px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 pt-12">
              <InstructionsCard agentId={agentId} />
              <ScheduledRailCard agentId={agentId} />
              <SkillsRailCard agentId={agentId} />
              <ContextCard
                agentId={agentId}
                onOpenFile={(file, workingDir) => setPreview({ file, workingDir })}
              />
            </aside>
          )}

          {/* File preview — floats over the right side (covers the rail), it
           *  does not compress the layout. */}
          {preview && (
            <div className="absolute inset-y-0 right-0 z-20 flex shadow-2xl">
              <PreviewPane
                file={preview.file}
                workingDir={preview.workingDir}
                onClose={() => setPreview(null)}
              />
            </div>
          )}
        </div>
      }
    />
  );
}
