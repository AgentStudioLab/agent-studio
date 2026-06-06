import { useEffect, useMemo, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  createProviderConnection,
  refreshProviderConnectionModels,
  setProviderConnectionEnabledModels,
  updateProviderConnection,
  type BuiltInProfile,
  type ProfileId,
  type ProviderConnectionConfig,
} from "@/lib/data/settings";
import { ProviderModelSelector } from "./ProviderModelSelector";

interface ProviderConnectionDialogProps {
  open: boolean;
  mode: "create" | "edit";
  connection: ProviderConnectionConfig | null;
  builtIn: BuiltInProfile[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  labels: {
    addTitle: string;
    editTitle: string;
    description: string;
    name: string;
    provider: string;
    custom: string;
    baseUrl: string;
    baseUrlPlaceholder: string;
    apiKey: string;
    apiKeyPlaceholder: string;
    showApiKey: string;
    hideApiKey: string;
    enabled: string;
    refresh: string;
    refreshing: string;
    refreshSuccess: string;
    refreshError: string;
    missingKey: string;
    unsupported: string;
    save: string;
    cancel: string;
    saved: string;
    saveError: string;
    models: string;
    modelSearch: string;
    modelEmpty: string;
  };
}

interface FormState {
  name: string;
  profileId: ProfileId;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  enabledModelIds: string[];
  defaultModelId: string | null;
}

function defaultForm(builtIn: BuiltInProfile[]): FormState {
  const profile = builtIn[0];
  return {
    name: profile?.label ?? "Anthropic",
    profileId: profile?.id ?? "anthropic",
    baseUrl: profile?.baseUrl ?? "",
    apiKey: "",
    enabled: true,
    enabledModelIds: [],
    defaultModelId: null,
  };
}

function formFromConnection(connection: ProviderConnectionConfig): FormState {
  return {
    name: connection.providerName,
    profileId: connection.profileId,
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey,
    enabled: connection.enabled,
    enabledModelIds: connection.enabledModelIds,
    defaultModelId: connection.defaultModelId,
  };
}

export function ProviderConnectionDialog({
  open,
  mode,
  connection,
  builtIn,
  onOpenChange,
  onSaved,
  labels,
}: ProviderConnectionDialogProps) {
  const [form, setForm] = useState<FormState>(() => defaultForm(builtIn));
  const [showApiKey, setShowApiKey] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<
    "success" | "missing" | "unsupported" | "error" | null
  >(null);
  const [saveMsg, setSaveMsg] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    if (!open) return;
    setRefreshMsg(null);
    setSaveMsg(null);
    setShowApiKey(false);
    setForm(connection ? formFromConnection(connection) : defaultForm(builtIn));
  }, [open, connection, builtIn]);

  const selectedBuiltIn = builtIn.find((profile) => profile.id === form.profileId);
  const models = useMemo(() => {
    if (connection?.profileId === form.profileId) return connection.models;
    return selectedBuiltIn?.models ?? [];
  }, [connection, form.profileId, selectedBuiltIn]);

  const handleProfileChange = (value: string) => {
    const profileId = value as ProfileId;
    const profile = builtIn.find((entry) => entry.id === profileId);
    setForm((current) => ({
      ...current,
      profileId,
      name: current.name || profile?.label || "Custom",
      baseUrl: profile?.baseUrl ?? current.baseUrl,
      enabledModelIds: [],
      defaultModelId: null,
    }));
  };

  const saveConnection = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      let saved = connection;
      if (mode === "create" || !connection) {
        const state = await createProviderConnection({
          name: form.name,
          profileId: form.profileId,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          enabled: form.enabled,
        });
        saved = state.connection;
      } else {
        const state = await updateProviderConnection(connection.providerId, {
          providerName: form.name,
          profileId: form.profileId,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          enabled: form.enabled,
          defaultModelId: form.defaultModelId,
        });
        saved = state.connection;
      }
      if (saved) {
        await setProviderConnectionEnabledModels(saved.providerId, {
          modelIds: form.enabledModelIds,
          defaultModelId: form.enabledModelIds[0] ?? null,
        });
      }
      setSaveMsg("saved");
      onSaved();
      onOpenChange(false);
    } catch {
      setSaveMsg("error");
    } finally {
      setSaving(false);
    }
  };

  const refreshModels = async () => {
    if (!connection) return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await updateProviderConnection(connection.providerId, {
        providerName: form.name,
        profileId: form.profileId,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        enabled: form.enabled,
      });
      const state = await refreshProviderConnectionModels(connection.providerId);
      setForm(formFromConnection(state.connection));
      setRefreshMsg("success");
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "missing_api_key") setRefreshMsg("missing");
      else if (message === "unsupported_remote_models") setRefreshMsg("unsupported");
      else setRefreshMsg("error");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? labels.addTitle : labels.editTitle}
          </DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label={labels.name}>
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              aria-label={labels.name}
            />
          </Field>
          <Field label={labels.provider}>
            <Select value={form.profileId} onValueChange={handleProfileChange}>
              <SelectTrigger aria-label={labels.provider} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                side="bottom"
                position="popper"
                avoidCollisions={false}
                className="max-h-56"
              >
                {builtIn.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.label}
                  </SelectItem>
                ))}
                <SelectItem value="custom">{labels.custom}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={labels.baseUrl}>
            <Input
              value={form.baseUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
              placeholder={labels.baseUrlPlaceholder}
            />
          </Field>
          <Field label={labels.apiKey}>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    apiKey: event.target.value,
                  }))
                }
                placeholder={labels.apiKeyPlaceholder}
                className="pr-10"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      showApiKey ? labels.hideApiKey : labels.showApiKey
                    }
                    className="absolute top-1/2 right-1 -translate-y-1/2 active:!-translate-y-1/2"
                    onClick={() => setShowApiKey((value) => !value)}
                  >
                    {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {showApiKey ? labels.hideApiKey : labels.showApiKey}
                </TooltipContent>
              </Tooltip>
            </div>
          </Field>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <span className="text-sm font-medium text-foreground">
              {labels.enabled}
            </span>
            <Switch
              checked={form.enabled}
              onCheckedChange={(enabled) =>
                setForm((current) => ({ ...current, enabled }))
              }
            />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {labels.models}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refreshModels()}
                disabled={!connection || refreshing}
              >
                {refreshing ? labels.refreshing : labels.refresh}
              </Button>
            </div>
            <ProviderModelSelector
              models={models}
              enabledModelIds={form.enabledModelIds}
              onChange={(modelIds) =>
                setForm((current) => ({
                  ...current,
                  enabledModelIds: modelIds,
                  defaultModelId:
                    current.defaultModelId && modelIds.includes(current.defaultModelId)
                      ? current.defaultModelId
                      : (modelIds[0] ?? null),
                }))
              }
              labels={{
                search: labels.modelSearch,
                empty: labels.modelEmpty,
              }}
            />
            {refreshMsg === "success" && (
              <p className="text-sm text-muted-foreground">
                {labels.refreshSuccess}
              </p>
            )}
            {refreshMsg === "missing" && (
              <p className="text-sm text-destructive">{labels.missingKey}</p>
            )}
            {refreshMsg === "unsupported" && (
              <p className="text-sm text-destructive">{labels.unsupported}</p>
            )}
            {refreshMsg === "error" && (
              <p className="text-sm text-destructive">{labels.refreshError}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          {saveMsg === "saved" && (
            <span className="self-center text-sm text-muted-foreground">
              {labels.saved}
            </span>
          )}
          {saveMsg === "error" && (
            <span className="self-center text-sm text-destructive">
              {labels.saveError}
            </span>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="button" onClick={() => void saveConnection()} disabled={saving}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
