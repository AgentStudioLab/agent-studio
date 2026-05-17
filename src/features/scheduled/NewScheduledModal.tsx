import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
];

export function NewScheduledModal({ open, onOpenChange, onSave }: NewScheduledModalProps) {
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">Create scheduled task</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="grid gap-2">
            <label htmlFor="task-name" className="text-sm font-medium text-foreground">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily brief"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="task-desc" className="text-sm font-medium text-foreground">
              Description <span className="text-destructive">*</span>
            </label>
            <Input
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Morning summary of today's calendar and tasks"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="task-prompt" className="text-sm font-medium text-foreground">
              Prompt
            </label>
            <Textarea
              id="task-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Summarize my calendar and unread emails..."
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Frequency</label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {showTimeInput && (
              <div className="grid gap-2">
                <label htmlFor="task-time" className="text-sm font-medium text-foreground">
                  Time
                </label>
                <Input
                  id="task-time"
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-28"
                />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Add a randomized delay of several minutes for server performance.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
