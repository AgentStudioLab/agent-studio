import { ChevronDown } from "lucide-react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAvailableModels } from "@/lib/models";

interface ModelPickerProps {
  /** Selected model id. `null` → first model in the fetched list. */
  value: string | null;
  onChange: (id: string) => void;
  /** Lock the picker (e.g. after a session has started — model is fixed). */
  disabled?: boolean;
  /** Tooltip explaining why it's locked. */
  disabledReason?: string;
}

export function ModelPicker({
  value,
  onChange,
  disabled,
  disabledReason,
}: ModelPickerProps) {
  const { models, defaultModelId } = useAvailableModels();
  const effectiveId = value ?? defaultModelId;
  const selected = models.find((m) => m.id === effectiveId);
  // Loading / empty: show "Model" placeholder so the trigger doesn't collapse.
  const label = selected?.displayName ?? effectiveId ?? "Model";

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-60">
            {label}
            <ChevronDown className="size-3" />
          </span>
        </TooltipTrigger>
        {disabledReason && (
          <TooltipContent side="top" className="max-w-[260px]">
            {disabledReason}
          </TooltipContent>
        )}
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton>
          <span>{label}</span>
          <ChevronDown className="size-3" />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => onChange(m.id)}
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
  );
}
