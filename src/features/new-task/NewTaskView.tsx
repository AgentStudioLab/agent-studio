import { ChevronDown, ExternalLink, FolderOpen, FolderPlus, Hand } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { BrandStar } from "@/shared/atoms/BrandStar";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createConversation } from "@/lib/data/conversations";

/** Take just the last segment of a /-separated path for a compact button label. */
function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function NewTaskView() {
  const { t } = useTranslation();
  const { setView, setActiveTaskId, setPendingFirstPrompt } = useAppShell();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `null` = use the server default (~/.agent-studio).
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handlePickFolder = async () => {
    setPopoverOpen(false);
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t("newTask.workInProject.pickerTitle"),
    });
    // openDialog returns `string | null` when multiple=false. Array path
    // (multiple=true) is unused here, but keep the type narrowing safe.
    if (typeof picked === "string") {
      setWorkingDir(picked);
    }
  };

  const handleSubmit = async ({ text }: PromptInputMessage) => {
    if (text.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Title = first ~60 chars of prompt so the sidebar entry is recognisable
      // before the title summariser (future) replaces it.
      const conv = await createConversation({
        title: text.slice(0, 60),
        workingDir,
      });
      setActiveTaskId(conv.id);
      // TaskView reads this and immediately POST /ag-ui/run with the prompt.
      setPendingFirstPrompt({ conversationId: conv.id, text });
      setView("task");
    } catch (e) {
      setError(e instanceof Error ? e.message : "submit_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col items-center overflow-y-auto px-12 pt-[18%]">
          <div className="flex w-full max-w-[760px] flex-col items-start">
            <div className="mb-3 flex items-center gap-4">
              <BrandStar size={28} />
              <h1 className="font-serif text-[36px] font-normal leading-[1.15] tracking-tight text-foreground">
                {t("newTask.welcome.heading")}
              </h1>
            </div>
            <a
              href="#"
              className="mb-10 ml-12 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              {t("newTask.welcome.learnMore")}
              <ExternalLink className="size-3" />
            </a>
            <div className="w-full">
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputTextarea placeholder={t("newTask.input.placeholder")} />
                <PromptInputFooter>
                  <PromptInputTools>
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <PromptInputButton>
                          <FolderOpen className="size-4" />
                          <span>
                            {workingDir
                              ? basename(workingDir)
                              : t("newTask.input.workInProject")}
                          </span>
                          <ChevronDown className="size-3" />
                        </PromptInputButton>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[320px] p-1"
                      >
                        <button
                          type="button"
                          onClick={() => void handlePickFolder()}
                          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-[hsl(var(--bg-100))]"
                          style={{ color: "hsl(var(--text-100))" }}
                        >
                          <FolderPlus className="size-4 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div>{t("newTask.workInProject.chooseFolder")}</div>
                            {workingDir && (
                              <div
                                className="truncate text-[11.5px]"
                                style={{ color: "hsl(var(--text-300))" }}
                              >
                                {workingDir}
                              </div>
                            )}
                          </div>
                        </button>
                      </PopoverContent>
                    </Popover>
                    <PromptInputButton>
                      <Hand className="size-4" />
                      <span>{t("newTask.input.ask")}</span>
                      <ChevronDown className="size-3" />
                    </PromptInputButton>
                  </PromptInputTools>
                  <PromptInputTools>
                    <PromptInputButton>
                      <span>{t("newTask.input.legacyModel")}</span>
                      <ChevronDown className="size-3" />
                    </PromptInputButton>
                    <PromptInputSubmit />
                  </PromptInputTools>
                </PromptInputFooter>
              </PromptInput>
              {error && (
                <p className="mt-2 text-sm" style={{ color: "hsl(var(--danger-100))" }}>
                  {error === "api_key_missing"
                    ? t("newTask.error.apiKeyMissing")
                    : t("newTask.error.generic", { msg: error })}
                </p>
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
