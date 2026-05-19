import { ChevronDown, Hand } from "lucide-react";
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

interface TaskMessageInputProps {
  onSend: (text: string) => void | Promise<void>;
  onStop?: () => void;
  /** True while the run is in flight — flips submit button into "Stop" mode. */
  streaming?: boolean;
}

export function TaskMessageInput({
  onSend,
  onStop,
  streaming = false,
}: TaskMessageInputProps) {
  const { t } = useTranslation();

  const handleSubmit = async (msg: PromptInputMessage) => {
    const text = msg.text.trim();
    if (!text || streaming) return;
    await onSend(text);
  };

  return (
    <div className="w-full">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          placeholder={t("task.input.placeholder")}
          rows={2}
        />
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton>
              <Hand className="size-4" />
              <span>{t("task.input.ask")}</span>
              <ChevronDown className="size-3" />
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputTools>
            <PromptInputButton>
              <span>{t("task.input.legacyModel")}</span>
              <ChevronDown className="size-3" />
            </PromptInputButton>
            {/* Submit button reuses the same shape; only the icon flips
                (CornerDownLeft → Square) while streaming, and clicking it
                calls onStop instead of submitting. */}
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
    </div>
  );
}
