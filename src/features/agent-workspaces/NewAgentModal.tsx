import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AgentCoverImage, AgentFunctionCategory } from "@/lib/data/types";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { AVATAR_HUES, type AvatarHue, initialsFromName } from "@/shared/atoms/agent-avatar";
import {
  AGENT_CATEGORY_META,
  AGENT_CATEGORY_ORDER,
  normalizeAgentCategory,
} from "./agent-catalog";
import { AgentCategoryChoice } from "./AgentCategoryChoice";

interface NewAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: {
    name: string;
    avatar: string | null;
    category: AgentFunctionCategory;
    coverImage: AgentCoverImage;
    instructions: string;
  }) => void;
  /** "create" (default) or "edit" — only changes the title + initial value. */
  mode?: "create" | "edit";
  /** Seeds the name field when opening in edit mode. */
  initialName?: string;
  /** Seeds the hue picker when opening in edit mode. */
  initialAvatar?: string | null;
  /** Seeds the function category when opening in edit mode. */
  initialCategory?: string | null;
}

const INPUT_CLASS =
  "w-full rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30";
const LABEL_CLASS = "mb-1.5 block text-[13px] text-text-200";

export function NewAgentModal({
  open,
  onOpenChange,
  onSave,
  mode = "create",
  initialName,
  initialAvatar,
  initialCategory,
}: NewAgentModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [avatar, setAvatar] = useState<AvatarHue | null>(null);
  const [category, setCategory] = useState<AgentFunctionCategory>("general");
  const canSave = name.trim().length > 0;
  const showInstructions = mode === "create";

  // Seed (or reset) the fields each time the modal opens.
  useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setInstructions("");
      setAvatar(AVATAR_HUES.find((h) => h === initialAvatar) ?? null);
      setCategory(normalizeAgentCategory(initialCategory));
    }
  }, [open, initialName, initialAvatar, initialCategory]);

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({
      name: name.trim(),
      avatar,
      category,
      coverImage: category,
      instructions: instructions.trim(),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-64px)] gap-0 overflow-y-auto overscroll-contain rounded-2xl p-6 sm:max-w-[560px]">
        <DialogHeader className="mb-5">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {mode === "edit" ? t("agents.modal.editTitle") : t("agents.modal.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="mb-2">
          <label htmlFor="agent-name" className={LABEL_CLASS}>
            {t("agents.modal.name")} <span className="text-danger-100">*</span>
          </label>
          <input
            id="agent-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("agents.modal.namePlaceholder")}
            className={INPUT_CLASS}
          />
        </div>
        {showInstructions && (
          <div className="mt-4">
            <label htmlFor="agent-instructions" className={LABEL_CLASS}>
              {t("agents.modal.instructions")}
            </label>
            <p
              id="agent-instructions-description"
              className="mb-2 text-xs leading-5 text-muted-foreground"
            >
              {t("agents.modal.instructionsDescription")}
            </p>
            <textarea
              id="agent-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t("agents.modal.instructionsPlaceholder")}
              aria-describedby="agent-instructions-description"
              className={cn(INPUT_CLASS, "min-h-20 resize-none leading-5")}
            />
          </div>
        )}
        <div className="mt-4">
          <span className={LABEL_CLASS}>{t("agents.modal.category")}</span>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup">
            {AGENT_CATEGORY_ORDER.map((item) => (
              <AgentCategoryChoice
                key={item}
                category={item}
                label={t(AGENT_CATEGORY_META[item].labelKey)}
                description={t(AGENT_CATEGORY_META[item].descriptionKey)}
                selected={category === item}
                onClick={() => setCategory(item)}
                role="radio"
                className="min-h-12 gap-2 p-1.5"
              />
            ))}
          </div>
        </div>
        <div className="mt-4">
          <span className={LABEL_CLASS}>{t("agents.modal.color")}</span>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t("agents.modal.color")}
          >
            {AVATAR_HUES.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={avatar === h}
                onClick={() => setAvatar(h)}
                className={cn(
                  "rounded-md outline-hidden ring-offset-2 ring-offset-background transition",
                  avatar === h && "ring-2 ring-ring",
                )}
              >
                <InitialsAvatar initials={initialsFromName(name)} hue={h} size={32} />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-[13.5px] text-text-200 transition hover:bg-bg-200"
          >
            {t("agents.modal.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "edit" ? t("agents.modal.editSave") : t("agents.modal.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
