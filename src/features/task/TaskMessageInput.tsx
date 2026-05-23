import { useState } from "react";
import { ChevronDown, FastForward, Hand } from "lucide-react";
import { useTranslation } from "react-i18next";
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

interface TaskMessageInputProps {
  threadId: string;
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  /** True while the run is in flight — flips submit button into "Stop" mode. */
  streaming?: boolean;
}

export function TaskMessageInput({
  threadId,
  onSend,
  onStop,
  streaming = false,
}: TaskMessageInputProps) {
  const { t } = useTranslation();
  const { mode, setMode } = useThreadPermissionMode(threadId);
  // Confirmation dialog is the safety gate between the dropdown click and the
  // mode flip. We do NOT change mode optimistically — only after the user
  // explicitly clicks "Yes, continue" in the dialog.
  const [confirmAct, setConfirmAct] = useState(false);

  const handleSubmit = async (msg: PromptInputMessage) => {
    const text = msg.text.trim();
    if (!text || streaming) return;
    await onSend(text);
  };

  const isAct = mode === "act-without-asking";

  return (
    <div className="w-full">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          placeholder={t("task.input.placeholder")}
          rows={2}
        />
        <PromptInputFooter>
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
            <PromptInputButton>
              <span>{t("task.input.legacyModel")}</span>
              <ChevronDown className="size-3" />
            </PromptInputButton>
            <PromptInputSubmit
              status={streaming ? "streaming" : undefined}
              onStop={onStop}
            />
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
