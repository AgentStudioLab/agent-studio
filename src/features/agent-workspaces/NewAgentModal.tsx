import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NewAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: { name: string }) => void;
  /** "create" (default) or "edit" — only changes the title + initial value. */
  mode?: "create" | "edit";
  /** Seeds the name field when opening in edit mode. */
  initialName?: string;
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
}: NewAgentModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const canSave = name.trim().length > 0;

  // Seed (or reset) the field each time the modal opens.
  useEffect(() => {
    if (open) setName(initialName ?? "");
  }, [open, initialName]);

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({ name: name.trim() });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[560px]">
        <DialogHeader className="mb-6">
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
        <div className="mt-6 flex items-center justify-end gap-2">
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
            className="rounded-md bg-text-100 px-4 py-2 text-[13.5px] font-medium text-bg-100 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "edit" ? t("agents.modal.editSave") : t("agents.modal.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
