import { ChevronDown } from "lucide-react";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvailableModels } from "@/lib/models";

interface ModelPickerProps {
  /** Selected model id. `null` → first model in the fetched list. */
  value: string | null;
  onChange: (id: string) => void;
}

export function ModelPicker({ value, onChange }: ModelPickerProps) {
  const { models, defaultModelId } = useAvailableModels();
  const effectiveId = value ?? defaultModelId;
  const selected = models.find((m) => m.id === effectiveId);
  // Loading / empty: show "Model" placeholder so the trigger doesn't collapse.
  const label = selected?.displayName ?? effectiveId ?? "Model";

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
