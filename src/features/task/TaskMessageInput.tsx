import { useRef, useState } from "react";
import {
  ChevronDown,
  CornerDownRight,
  FastForward,
  Hand,
  SquareIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { useThreadPermissionMode } from "@/lib/agui/react/useThreadPermissionMode";
import { useThreadModel } from "@/lib/agui/react/useThreadModel";
import { ModelPicker } from "@/features/task/ModelPicker";

interface TaskMessageInputProps {
  threadId: string;
  /** Default send (Enter when idle, not streaming). */
  onSend: (text: string) => void | Promise<void>;
  /** Plain Enter / Queue button click while streaming — adds to queue. */
  onQueue?: (text: string) => void;
  /** Cmd/Ctrl+Enter while streaming — cancels active run, sends immediately. */
  onOverride?: (text: string) => void;
  /** Stop button click — only visible while streaming. */
  onStop?: () => void;
  /** True while the run is in flight. */
  streaming?: boolean;
  /** Lock the model picker — the session has started, model is fixed. */
  modelLocked?: boolean;
  /** Conversation-level default model (seeded for scheduled runs) shown when
   *  the user hasn't picked a per-thread model. */
  fallbackModel?: string | null;
}

export function TaskMessageInput({
  threadId,
  onSend,
  onQueue,
  onOverride,
  onStop,
  streaming = false,
  modelLocked = false,
  fallbackModel = null,
}: TaskMessageInputProps) {
  const { t } = useTranslation();
  const { mode, setMode } = useThreadPermissionMode(threadId);
  const { model, setModel } = useThreadModel(threadId);
  // Confirmation dialog is the safety gate between the dropdown click and the
  // mode flip. We do NOT change mode optimistically — only after the user
  // explicitly clicks "Yes, continue" in the dialog.
  const [confirmAct, setConfirmAct] = useState(false);
  // Set by the keydown handler when the user pressed Cmd/Ctrl+Enter; read
  // (and reset) inside handleSubmit so we can route through the same form
  // submit pipeline without duplicating textarea-value reading.
  const overrideIntentRef = useRef(false);

  const handleSubmit = async (msg: PromptInputMessage) => {
    const text = msg.text.trim();
    if (!text) return;
    if (streaming) {
      if (overrideIntentRef.current) {
        overrideIntentRef.current = false;
        onOverride?.(text);
      } else {
        onQueue?.(text);
      }
      return;
    }
    await onSend(text);
  };

  const isAct = mode === "act-without-asking";

  return (
    <div className="w-full">
      <PromptInput onSubmit={handleSubmit}>
        <SlashEditor
          placeholder={t("task.input.placeholder")}
          rows={2}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter during streaming = "override send". Don't
            // preventDefault — let SlashEditor's Enter handler trigger form
            // submit, which lands in handleSubmit with overrideIntentRef set.
            if (
              streaming &&
              e.key === "Enter" &&
              (e.metaKey || e.ctrlKey) &&
              !e.isComposing
            ) {
              overrideIntentRef.current = true;
            }
          }}
        />
        <PromptInputFooter className="px-4 pb-3">
          <PromptInputTools>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PromptInputButton>
                  {isAct ? (
                    <FastForward className="size-4" />
                  ) : (
                    <Hand className="size-4" />
                  )}
                  <span>
                    {isAct
                      ? t("task.input.permissionMode.actShort")
                      : t("task.input.permissionMode.askShort")}
                  </span>
                  <ChevronDown className="size-3" />
                </PromptInputButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuItem
                  onSelect={() => setMode("ask")}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Hand className="size-4" />
                    <span className="text-[13px] font-medium">
                      {t("task.input.permissionMode.askTitle")}
                    </span>
                  </div>
                  <span className="pl-6 text-[12px] text-muted-foreground">
                    {t("task.input.permissionMode.askDesc")}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setConfirmAct(true)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <FastForward className="size-4" />
                    <span className="text-[13px] font-medium">
                      {t("task.input.permissionMode.actTitle")}
                    </span>
                  </div>
                  <span className="pl-6 text-[12px] text-muted-foreground">
                    {t("task.input.permissionMode.actDesc")}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </PromptInputTools>
          <PromptInputTools>
            <ModelPicker
              value={model ?? fallbackModel}
              onChange={setModel}
              disabled={modelLocked}
              disabledReason={t("task.input.modelLocked")}
            />
            {/*
              During streaming OR HITL-pause we render TWO buttons:
                - Stop (square icon, neutral border): cancels the active run
                - Queue (orange pill with ↳ + label): submit-type, routes
                  through form.onSubmit → handleSubmit → onQueue
              The split keeps "stop" and "send a queued message" as separate
              gestures. During idle we fall back to the default submit-arrow
              <PromptInputSubmit>.
            */}
            {streaming ? (
              <>
                {onStop && (
                  <button
                    type="button"
                    onClick={onStop}
                    aria-label={t("task.input.stop", { defaultValue: "Stop" })}
                    className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-muted"
                    style={{
                      color: "hsl(var(--text-200))",
                      border: "1px solid hsl(var(--border-300) / 0.25)",
                    }}
                  >
                    <SquareIcon className="size-3.5" />
                  </button>
                )}
                <button
                  type="submit"
                  aria-label={t("task.queue.label")}
                  title={t("task.queue.queueTooltip")}
                  className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition hover:opacity-90"
                  style={{
                    background: "hsl(var(--brand-100))",
                    color: "hsl(var(--oncolor-100))",
                  }}
                >
                  <CornerDownRight className="size-3.5" />
                  {t("task.queue.label")}
                </button>
              </>
            ) : (
              <PromptInputSubmit status={undefined} />
            )}
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
      <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
        {t("task.input.disclaimer")}
      </p>

      <AlertDialog open={confirmAct} onOpenChange={setConfirmAct}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("task.input.permissionMode.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("task.input.permissionMode.confirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("task.input.permissionMode.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setMode("act-without-asking");
                setConfirmAct(false);
              }}
            >
              {t("task.input.permissionMode.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
