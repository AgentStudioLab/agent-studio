import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Briefcase,
  ChevronDown,
  FastForward,
  FolderPlus,
  Hand,
} from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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
import { useAvailableModels } from "@/lib/models";
import type { Frequency, SchedulePermissionMode } from "@/lib/data/types";

export interface NewScheduledFormData {
  name: string;
  description: string;
  prompt: string;
  frequency: Frequency;
  timeOfDay?: string;
  weekday?: number | null;
  workingDir?: string | null;
  model?: string | null;
  permissionMode?: SchedulePermissionMode;
}

interface NewScheduledModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: NewScheduledFormData) => void;
  /** "edit" pre-fills the form and swaps the heading. Defaults to "create". */
  mode?: "create" | "edit";
  /** Initial values for edit mode (applied each time the dialog opens). */
  initial?: NewScheduledFormData;
}

const FREQUENCY_VALUES: Frequency[] = ["manual", "hourly", "daily", "weekdays", "weekly"];

const INPUT_CLASS =
  "w-full rounded-md border border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100 placeholder:text-text-400 focus:outline-none focus:ring-2 focus:ring-accent-100/30";

const LABEL_CLASS = "mb-1.5 block text-[13px] text-text-200";

const CHIP_CLASS =
  "flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-text-300 transition hover:bg-bg-300 hover:text-text-100";

function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

export function NewScheduledModal({
  open,
  onOpenChange,
  onSave,
  mode = "create",
  initial,
}: NewScheduledModalProps) {
  const { t, i18n } = useTranslation();
  const { models, defaultModelId } = useAvailableModels();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [weekday, setWeekday] = useState<number>(new Date().getDay());
  const [workingDir, setWorkingDir] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] =
    useState<SchedulePermissionMode>("ask");
  const [confirmAct, setConfirmAct] = useState(false);

  // Seed form state from `initial` ONLY on the closed→open transition. `initial`
  // is a fresh object literal on every parent render (and the parent re-renders
  // on its 5s status poll), so depending on `initial` here would wipe the user's
  // in-progress edits every poll. The ref keeps the latest values without making
  // the effect re-run.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (!open) return;
    const init = initialRef.current;
    setName(init?.name ?? "");
    setDescription(init?.description ?? "");
    setPrompt(init?.prompt ?? "");
    setFrequency(init?.frequency ?? "daily");
    setTimeOfDay(init?.timeOfDay ?? "09:00");
    setWeekday(init?.weekday ?? new Date().getDay());
    setWorkingDir(init?.workingDir ?? null);
    setModel(init?.model ?? null);
    setPermissionMode(init?.permissionMode ?? "ask");
  }, [open]);

  const canSave = name.trim().length > 0 && description.trim().length > 0;
  const showTimeInput = frequency !== "manual" && frequency !== "hourly";

  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: "long" });
    // 2024-01-07 is a Sunday → index 0..6 maps to Sun..Sat.
    return Array.from({ length: 7 }, (_, d) =>
      fmt.format(new Date(2024, 0, 7 + d)),
    );
  }, [i18n.language]);

  const effectiveModelId = model ?? defaultModelId;
  const selectedModel = models.find((m) => m.id === effectiveModelId);
  const modelLabel =
    selectedModel?.displayName ??
    effectiveModelId ??
    t("scheduled.modal.promptChips.defaultModel");

  const pickFolder = async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: t("scheduled.modal.promptChips.workInProject"),
    });
    if (typeof picked === "string") setWorkingDir(picked);
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave?.({
      name,
      description,
      prompt,
      frequency,
      timeOfDay: showTimeInput ? timeOfDay : undefined,
      weekday: frequency === "weekly" ? weekday : null,
      workingDir,
      model,
      permissionMode,
    });
    onOpenChange(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[640px]">
        <DialogHeader className="mb-6">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {mode === "edit"
              ? t("scheduled.modal.editTitle")
              : t("scheduled.modal.title")}
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
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className={CHIP_CLASS}>
                  <Briefcase className="size-3.5" />
                  {workingDir
                    ? basename(workingDir)
                    : t("scheduled.modal.promptChips.workInProject")}
                  <ChevronDown className="size-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[320px] p-1">
                <button
                  type="button"
                  onClick={() => void pickFolder()}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] text-text-100 transition-colors hover:bg-[hsl(var(--bg-100))]"
                >
                  <FolderPlus className="size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div>{t("scheduled.modal.promptChips.chooseFolder")}</div>
                    {workingDir && (
                      <div className="truncate text-[11.5px] text-text-300">
                        {workingDir}
                      </div>
                    )}
                  </div>
                </button>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={CHIP_CLASS}>
                  {permissionMode === "act-without-asking" ? (
                    <FastForward className="size-3.5" />
                  ) : (
                    <Hand className="size-3.5" />
                  )}
                  {permissionMode === "act-without-asking"
                    ? t("scheduled.modal.permissionMode.actShort")
                    : t("scheduled.modal.permissionMode.askShort")}
                  <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuItem
                  onSelect={() => setPermissionMode("ask")}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Hand className="size-4" />
                    <span className="text-[13px] font-medium">
                      {t("scheduled.modal.permissionMode.askTitle")}
                    </span>
                  </div>
                  <span className="pl-6 text-[12px] text-muted-foreground">
                    {t("scheduled.modal.permissionMode.askDesc")}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setConfirmAct(true)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <div className="flex items-center gap-2">
                    <FastForward className="size-4" />
                    <span className="text-[13px] font-medium">
                      {t("scheduled.modal.permissionMode.actTitle")}
                    </span>
                  </div>
                  <span className="pl-6 text-[12px] text-muted-foreground">
                    {t("scheduled.modal.permissionMode.actDesc")}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={CHIP_CLASS}>
                  {modelLabel}
                  <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px]">
                {models.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onSelect={() => setModel(m.id)}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <span className="text-[13px] font-medium">{m.displayName}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {m.description}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mb-2">
          <label className={LABEL_CLASS}>{t("scheduled.modal.frequency")}</label>
          <div className="flex flex-wrap items-center gap-2">
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
            {frequency === "weekly" && (
              <Select
                value={String(weekday)}
                onValueChange={(v) => setWeekday(Number(v))}
              >
                <SelectTrigger className="h-auto min-w-[110px] rounded-md border-border-300/15 bg-bg-200 px-3 py-2 text-[14px] text-text-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekdayLabels.map((label, d) => (
                    <SelectItem key={d} value={String(d)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

    <AlertDialog open={confirmAct} onOpenChange={setConfirmAct}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("scheduled.modal.permissionMode.confirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("scheduled.modal.permissionMode.confirmDesc")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("scheduled.modal.permissionMode.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setPermissionMode("act-without-asking");
              setConfirmAct(false);
            }}
          >
            {t("scheduled.modal.permissionMode.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
