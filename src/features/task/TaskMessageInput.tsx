import { ChevronDown, Hand } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

export function TaskMessageInput() {
  const { t } = useTranslation();
  return (
    <div className="w-full">
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder={t("task.input.placeholder")} rows={2} />
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
            <PromptInputSubmit />
          </PromptInputTools>
        </PromptInputFooter>
      </PromptInput>
      <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
        {t("task.input.disclaimer")}
      </p>
    </div>
  );
}
