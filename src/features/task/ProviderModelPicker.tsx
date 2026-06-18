import { ChevronDown, LockIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getProvider,
  type EnabledModelOption,
  type ProviderModelSelection,
  setDefaultProviderSelection,
} from "@/lib/data/settings";

interface ProviderModelPickerProps {
  value: ProviderModelSelection | null;
  onChange: (selection: ProviderModelSelection) => void;
  disabled?: boolean;
  disabledReason?: string;
}

function modelKey(selection: ProviderModelSelection): string {
  return `${selection.providerId}:${selection.modelId}`;
}

function groupModels(
  models: EnabledModelOption[],
): Array<{
  providerId: string;
  providerName: string;
  managed: boolean;
  models: EnabledModelOption[];
}> {
  const groups = new Map<
    string,
    {
      providerId: string;
      providerName: string;
      managed: boolean;
      models: EnabledModelOption[];
    }
  >();
  for (const model of models) {
    let group = groups.get(model.providerId);
    if (!group) {
      group = {
        providerId: model.providerId,
        providerName: model.providerName,
        managed: model.managed,
        models: [],
      };
      groups.set(model.providerId, group);
    }
    group.managed = group.managed || model.managed;
    group.models.push(model);
  }
  return [...groups.values()];
}

function displayLabel(
  models: EnabledModelOption[],
  value: ProviderModelSelection | null,
  fallback: ProviderModelSelection | null | undefined,
): string {
  const selected = value ?? fallback ?? null;
  const option = selected
    ? models.find(
        (model) =>
          model.providerId === selected.providerId &&
          model.modelId === selected.modelId,
      )
    : null;
  return option?.modelLabel ?? "Configure models";
}

export function ProviderModelPicker({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: ProviderModelPickerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["provider"],
    queryFn: getProvider,
    staleTime: 60 * 1000,
  });

  const enabledModels = data?.enabledModels ?? [];
  const selected = value ?? data?.defaultSelection ?? null;
  const selectedKey = selected ? modelKey(selected) : null;
  const label = displayLabel(enabledModels, value, data?.defaultSelection);
  const groups = groupModels(enabledModels);
  const hasModels = enabledModels.length > 0;
  const handleSelect = (selection: ProviderModelSelection) => {
    onChange(selection);
    queryClient.setQueryData(["provider"], (current: typeof data) =>
      current ? { ...current, defaultSelection: selection } : current,
    );
    void setDefaultProviderSelection(selection)
      .then((next) => {
        queryClient.setQueryData(["provider"], (current: typeof data) =>
          current ? { ...current, ...next, builtIn: current.builtIn } : next,
        );
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: ["provider"] });
      });
  };

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-60"
          >
            {label}
            <ChevronDown className="size-3" />
          </button>
        </TooltipTrigger>
        {disabledReason && (
          <TooltipContent side="top" className="max-w-[260px]">
            {disabledReason}
          </TooltipContent>
        )}
      </Tooltip>
    );
  }

  if (!hasModels) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground opacity-70"
          >
            Configure models
            <ChevronDown className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px]">
          Enable models in Settings.
        </TooltipContent>
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
      <DropdownMenuContent align="end" className="w-[320px]">
        {groups.map((group, index) => (
          <div key={group.providerId}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{group.providerName}</span>
              {group.managed && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  <LockIcon className="size-3" />
                  {t("task.modelPicker.official")}
                </span>
              )}
            </DropdownMenuLabel>
            {group.models.map((model) => {
              const key = modelKey(model);
              return (
                <DropdownMenuItem
                  key={key}
                  onSelect={() =>
                    handleSelect({
                      providerId: model.providerId,
                      modelId: model.modelId,
                    })
                  }
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="text-[13px] font-medium">
                    {model.modelLabel}
                  </span>
                  {key === selectedKey && (
                    <span className="text-[12px] font-medium text-[hsl(var(--success-100))]">
                      {t("task.modelPicker.selected")}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
