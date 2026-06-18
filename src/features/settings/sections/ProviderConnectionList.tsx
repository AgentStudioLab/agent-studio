import { Edit3Icon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ProviderConnectionSummary,
  ProviderModelSelection,
} from "@/lib/data/settings";

interface ProviderConnectionListProps {
  connections: ProviderConnectionSummary[];
  defaultSelection: ProviderModelSelection | null;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (connection: ProviderConnectionSummary) => void;
  labels: {
    title: string;
    add: string;
    edit: string;
    delete: string;
    default: string;
    setDefault: string;
    enabledModels: string;
    disabled: string;
    missingKey: string;
    managed: string;
  };
}

export function ProviderConnectionList({
  connections,
  defaultSelection,
  onAdd,
  onEdit,
  onDelete,
  onSetDefault,
  labels,
}: ProviderConnectionListProps) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">{labels.title}</h3>
        <Button type="button" variant="outline" onClick={onAdd}>
          <PlusIcon />
          {labels.add}
        </Button>
      </div>
      <div className="space-y-2">
        {connections.map((connection) => {
          const isDefault = defaultSelection?.providerId === connection.id;
          return (
            <div
              key={connection.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {connection.name}
                  </span>
                  {isDefault && (
                    <Badge
                      variant="ghost"
                      className="bg-success-100/15 text-success-100"
                    >
                      {labels.default}
                    </Badge>
                  )}
                  {connection.managed && (
                    <Badge variant="outline">
                      <LockIcon />
                      {labels.managed}
                    </Badge>
                  )}
                  {!connection.enabled && (
                    <Badge variant="outline">{labels.disabled}</Badge>
                  )}
                  {!connection.managed && !connection.hasApiKey && (
                    <Badge variant="destructive">{labels.missingKey}</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{connection.providerLabel}</span>
                  <span>{connection.baseUrl}</span>
                  <span>
                    {labels.enabledModels}: {connection.enabledModelCount}/
                    {connection.modelCount}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!isDefault && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${labels.setDefault} ${connection.name}`}
                    onClick={() => onSetDefault(connection)}
                  >
                    {labels.setDefault}
                  </Button>
                )}
                {!connection.managed && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${labels.edit} ${connection.name}`}
                      onClick={() => onEdit(connection.id)}
                    >
                      <Edit3Icon />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${labels.delete} ${connection.name}`}
                      onClick={() => onDelete(connection.id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
