import { ChevronDown, ExternalLink, FolderOpen, Hand } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { createConversation } from "@/lib/data/conversations";

export function NewTaskView() {
  const { t } = useTranslation();
  const { setView, setActiveTaskId, setPendingFirstPrompt } = useAppShell();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async ({ text }: PromptInputMessage) => {
    if (text.trim().length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const conv = await createConversation({ prompt: text, mode: "ask" });
      setActiveTaskId(conv.id);
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
                    <PromptInputButton>
                      <FolderOpen className="size-4" />
                      <span>{t("newTask.input.workInProject")}</span>
                      <ChevronDown className="size-3" />
                    </PromptInputButton>
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
