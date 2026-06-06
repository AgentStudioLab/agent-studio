import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ProfileModel } from "@/lib/data/settings";

interface ProviderModelSelectorProps {
  models: ProfileModel[];
  enabledModelIds: string[];
  defaultModelId: string | null;
  onChange: (modelIds: string[]) => void;
  onDefaultChange: (modelId: string) => void;
  labels: {
    search: string;
    empty: string;
    default: string;
    setDefault: string;
  };
}

export function ProviderModelSelector({
  models,
  enabledModelIds,
  defaultModelId,
  onChange,
  onDefaultChange,
  labels,
}: ProviderModelSelectorProps) {
  const [query, setQuery] = useState("");
  const enabledSet = useMemo(() => new Set(enabledModelIds), [enabledModelIds]);
  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(q) ||
        model.displayName.toLowerCase().includes(q),
    );
  }, [models, query]);

  const toggleModel = (modelId: string, checked: boolean) => {
    const nextSet = new Set(enabledSet);
    if (checked) {
      nextSet.add(modelId);
    } else {
      nextSet.delete(modelId);
    }
    onChange([...nextSet]);
  };

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={labels.search}
      />
      <div
        data-testid="provider-model-list"
        className="max-h-[240px] overscroll-contain space-y-1 overflow-y-auto rounded-md border border-border bg-background p-1"
        onWheelCapture={(event) => {
          event.stopPropagation();
          event.preventDefault();
          event.currentTarget.scrollTop += event.deltaY;
        }}
      >
        {visibleModels.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {labels.empty}
          </div>
        ) : (
          visibleModels.map((model) => (
            <div
              key={model.id}
              className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-muted"
            >
              <Checkbox
                checked={enabledSet.has(model.id)}
                onCheckedChange={(checked) =>
                  toggleModel(model.id, checked === true)
                }
                aria-label={model.displayName}
              />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {model.displayName}
                  </span>
                  {defaultModelId === model.id && (
                    <Badge variant="secondary">{labels.default}</Badge>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {model.description || model.id}
                </span>
              </span>
              {enabledSet.has(model.id) && defaultModelId !== model.id && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${labels.setDefault} ${model.displayName}`}
                  onClick={() => onDefaultChange(model.id)}
                >
                  {labels.setDefault}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
