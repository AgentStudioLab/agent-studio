import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, ChevronDown, HandMetal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Frequency } from "@/lib/mock/types";

export interface NewScheduledFormData {
  name: string;
  description: string;
  prompt: string;
  frequency: Frequency;
  timeOfDay?: string;
}

interface NewScheduledModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: NewScheduledFormData) => void;
}

const FREQUENCY_VALUES: Frequency[] = ["manual", "hourly", "daily", "weekdays", "weekly"];

const INPUT_CLASS =
  "w-full rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30";

const LABEL_CLASS = "mb-1.5 block text-[13px] text-text-200";

export function NewScheduledModal({ open, onOpenChange, onSave }: NewScheduledModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");

  const canSave = name.trim().length > 0 && description.trim().length > 0;
  const showTimeInput = frequency !== "manual" && frequency !== "hourly";

  const reset = () => {
    setName("");
    setDescription("");
    setPrompt("");
    setFrequency("daily");
    setTimeOfDay("09:00");
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({
      name,
      description,
      prompt,
      frequency,
      timeOfDay: showTimeInput ? timeOfDay : undefined,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[640px]">
        <DialogHeader className="mb-6">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {t("scheduled.modal.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="mb-5">
          <label htmlFor="task-name" className={LABEL_CLASS}>
            {t("scheduled.modal.name")} <span className="text-danger-100">*</span>
          </label>
          <input
            id="task-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("scheduled.modal.namePlaceholder")}
            className={INPUT_CLASS}
          />
        </div>

        <div className="mb-5">
          <label htmlFor="task-desc" className={LABEL_CLASS}>
            {t("scheduled.modal.description")} <span className="text-danger-100">*</span>
          </label>
          <input
            id="task-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("scheduled.modal.descriptionPlaceholder")}
            className={INPUT_CLASS}
          />
        </div>

        <div className="mb-6 rounded-xl border border-border-300/15 bg-bg-200/50">
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t("scheduled.modal.promptPlaceholder")}
            className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none"
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-text-300 transition hover:bg-bg-300 hover:text-text-100"
            >
              <Briefcase className="size-3.5" /> {t("scheduled.modal.promptChips.workInProject")}
              <ChevronDown className="size-3" />
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-text-300 transition hover:bg-bg-300 hover:text-text-100"
            >
              <HandMetal className="size-3.5" /> {t("scheduled.modal.promptChips.ask")}
              <ChevronDown className="size-3" />
            </button>
            <div className="flex-1" />
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[12.5px] text-text-300 transition hover:bg-bg-300 hover:text-text-100"
            >
              {t("scheduled.modal.promptChips.defaultModel")}
              <ChevronDown className="size-3" />
            </button>
          </div>
        </div>

        <div className="mb-2">
          <label className={LABEL_CLASS}>{t("scheduled.modal.frequency")}</label>
          <div className="flex items-center gap-2">
            <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
              <SelectTrigger className="h-auto min-w-[130px] rounded-md border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`scheduled.modal.frequencyOptions.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showTimeInput && (
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-[90px] rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 focus:outline-none focus:ring-2 focus:ring-accent-100/30"
              />
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-text-400">
            {t("scheduled.modal.delayHint")}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-[13.5px] text-text-200 transition hover:bg-bg-200"
          >
            {t("scheduled.modal.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-text-100 px-4 py-2 text-[13.5px] font-medium text-bg-100 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("scheduled.modal.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
