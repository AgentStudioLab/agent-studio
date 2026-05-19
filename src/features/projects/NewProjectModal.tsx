import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface NewProjectFormData {
  name: string;
  instructions: string;
}

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: NewProjectFormData) => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30";

const LABEL_CLASS = "mb-1.5 block text-[13px] text-text-200";

export function NewProjectModal({ open, onOpenChange, onSave }: NewProjectModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");

  const canSave = name.trim().length > 0;

  const reset = () => {
    setName("");
    setInstructions("");
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({ name, instructions });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[560px]">
        <DialogHeader className="mb-6">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {t("projects.modal.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="mb-5">
          <label htmlFor="project-name" className={LABEL_CLASS}>
            {t("projects.modal.name")} <span className="text-danger-100">*</span>
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("projects.modal.namePlaceholder")}
            className={INPUT_CLASS}
          />
        </div>

        <div className="mb-2">
          <label htmlFor="project-instructions" className={LABEL_CLASS}>
            {t("projects.modal.instructions")}
          </label>
          <textarea
            id="project-instructions"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t("projects.modal.instructionsPlaceholder")}
            className="w-full resize-none rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30"
          />
          <p className="mt-2 text-[11.5px] leading-relaxed text-text-400">
            {t("projects.modal.instructionsHint")}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-[13.5px] text-text-200 transition hover:bg-bg-200"
          >
            {t("projects.modal.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-text-100 px-4 py-2 text-[13.5px] font-medium text-bg-100 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("projects.modal.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
