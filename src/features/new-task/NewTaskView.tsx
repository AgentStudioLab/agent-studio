import { ChevronDown, ExternalLink, FastForward, FolderOpen, FolderPlus, Hand } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { BrandStar } from "@/shared/atoms/BrandStar";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { SlashEditor } from "@/features/composer/SlashEditor";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createConversation } from "@/lib/data/conversations";
import { queryKeys } from "@/lib/data/queries";
import { threadStatusKey } from "@/lib/agui/react/useChat";
import { useQueryClient } from "@tanstack/react-query";
import { useAvailableModels } from "@/lib/models";
import { ModelPicker } from "@/features/task/ModelPicker";

/** Take just the last segment of a /-separated path for a compact button label. */
function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function NewTaskView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setPendingFirstPrompt } = useAppShell();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `null` = use the server default (~/.agent-studio).
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Local-only mode: the thread doesn't exist yet, so we can't write to the
  // per-thread store. We carry it through pendingFirstPrompt and TaskView
  // persists it once the thread is opened.
  const [permissionMode, setPermissionMode] = useState<
    "ask" | "act-without-asking"
  >("ask");
  const [confirmAct, setConfirmAct] = useState(false);
  // Pre-thread model selection — same handoff pattern as permissionMode.
  // Default null = "use the fetched list's first id"; TaskView resolves and
  // persists into per-thread store once the thread is opened.
  const [model, setModel] = useState<string | null>(null);
  const { defaultModelId } = useAvailableModels();

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
      // We bypass useCreateConversationMutation (we need the returned
      // conv.id synchronously to navigate), so its onSuccess invalidation
      // doesn't run — invalidate the sidebar queries by hand so the new
      // thread shows up in Recents + Thread Statuses immediately instead
      // of waiting for the 5s staleTime to expire.
      void qc.invalidateQueries({ queryKey: queryKeys.recents });
      void qc.invalidateQueries({ queryKey: threadStatusKey });
      // TaskView reads this and immediately POST /ag-ui/run with the prompt.
      // The threadId is part of the URL — `useParams` in TaskView picks it up.
      setPendingFirstPrompt({
        conversationId: conv.id,
        text,
        permissionMode,
        model: model ?? defaultModelId ?? undefined,
      });
      navigate(`/task/${conv.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "submit_failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <AppShell
      main={
        <div
          data-tauri-drag-region
          className="bg-dot-grid flex h-full flex-col items-center overflow-y-auto px-12 pt-[18%]"
        >
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
              {/* Solid backplate occludes the dot-grid behind the prompt
                  card. The InputGroup (rendered by PromptInput) uses a
                  semi-transparent dark bg, so without this layer the dots
                  bleed through. Matching the form's rounded-2xl keeps the
                  silhouette clean. */}
              <div className="rounded-2xl bg-background">
                <PromptInput onSubmit={handleSubmit}>
                  <SlashEditor placeholder={t("newTask.input.placeholder")} />
                <PromptInputFooter className="px-4 pb-3">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <PromptInputButton>
                          {permissionMode === "act-without-asking" ? (
                            <FastForward className="size-4" />
                          ) : (
                            <Hand className="size-4" />
                          )}
                          <span>
                            {permissionMode === "act-without-asking"
                              ? t("newTask.input.permissionMode.actShort")
                              : t("newTask.input.permissionMode.askShort")}
                          </span>
                          <ChevronDown className="size-3" />
                        </PromptInputButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[320px]">
                        <DropdownMenuItem
                          onSelect={() => setPermissionMode("ask")}
                          className="flex flex-col items-start gap-0.5 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Hand className="size-4" />
                            <span className="text-[13px] font-medium">
                              {t("newTask.input.permissionMode.askTitle")}
                            </span>
                          </div>
                          <span className="pl-6 text-[12px] text-muted-foreground">
                            {t("newTask.input.permissionMode.askDesc")}
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setConfirmAct(true)}
                          className="flex flex-col items-start gap-0.5 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <FastForward className="size-4" />
                            <span className="text-[13px] font-medium">
                              {t("newTask.input.permissionMode.actTitle")}
                            </span>
                          </div>
                          <span className="pl-6 text-[12px] text-muted-foreground">
                            {t("newTask.input.permissionMode.actDesc")}
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </PromptInputTools>
                  <PromptInputTools>
                    <ModelPicker value={model} onChange={setModel} />
                    <PromptInputSubmit />
                  </PromptInputTools>
                </PromptInputFooter>
                </PromptInput>
              </div>
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
    <AlertDialog open={confirmAct} onOpenChange={setConfirmAct}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("newTask.input.permissionMode.confirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("newTask.input.permissionMode.confirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("newTask.input.permissionMode.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setPermissionMode("act-without-asking");
              setConfirmAct(false);
            }}
          >
            {t("newTask.input.permissionMode.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
