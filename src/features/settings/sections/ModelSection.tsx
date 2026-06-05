import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProvider,
  setProvider,
  type ProfileId,
} from "@/lib/data/settings";
import { refreshModels, useAvailableModels } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EyeIcon, EyeOffIcon } from "lucide-react";

export function ModelSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { models, defaultModelId } = useAvailableModels();
  const { data, isLoading } = useQuery({
    queryKey: ["provider"],
    queryFn: getProvider,
    staleTime: 60 * 1000,
  });

  // Local editable mirror. Initialized from server, diff-saved on submit.
  // Null `profileId` distinguishes "not loaded yet" from "loaded".
  const [profileId, setProfileIdLocal] = useState<ProfileId | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState<
    "success" | "missing" | "unsupported" | "error" | null
  >(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<"saved" | "error" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProfileIdLocal(data.current.profileId);
    setBaseUrl(data.current.baseUrl);
    setApiKey(data.current.apiKey);
    setSelectedModelId(data.current.selectedModelId);
  }, [data]);

  if (isLoading || !data || profileId === null) {
    return (
      <section>
        <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
          {t("settings.provider.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">…</p>
      </section>
    );
  }

  const selectedBuiltIn = data.builtIn.find((p) => p.id === profileId);
  const visibleModels =
    profileId === "custom"
      ? data.current.profileId === "custom"
        ? models
        : []
      : profileId === data.current.profileId
        ? models
        : (selectedBuiltIn?.models ?? []);
  const selectedModelIsVisible =
    selectedModelId !== null &&
    visibleModels.some((model) => model.id === selectedModelId);
  const defaultModelIsVisible =
    defaultModelId !== null &&
    visibleModels.some((model) => model.id === defaultModelId);
  const effectiveSelectedModelId = selectedModelIsVisible
    ? selectedModelId
    : defaultModelIsVisible
      ? defaultModelId
      : (visibleModels[0]?.id ?? null);
  const selectedModelValue = effectiveSelectedModelId ?? "";
  const compatibilityNote =
    profileId === data.current.profileId
      ? data.current.compatibilityNote ?? selectedBuiltIn?.compatibilityNote
      : selectedBuiltIn?.compatibilityNote;

  const handleProfileChange = (value: string) => {
    const nextProfileId = value as ProfileId;
    setProfileIdLocal(nextProfileId);
    setRefreshMsg(null);

    if (nextProfileId === "custom") {
      setSelectedModelId(null);
      return;
    }

    const nextProfile = data.builtIn.find((p) => p.id === nextProfileId);
    if (!nextProfile) return;
    setBaseUrl(nextProfile.baseUrl);
    setSelectedModelId(nextProfile.models[0]?.id ?? null);
  };

  const providerPatchForSave = () => {
    const nextSelectedModelId =
      visibleModels.some((model) => model.id === selectedModelId)
        ? selectedModelId
        : (visibleModels[0]?.id ?? null);
    return {
      profileId,
      baseUrl,
      apiKey,
      selectedModelId: nextSelectedModelId,
    };
  };

  const handleRefreshModels = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await setProvider(providerPatchForSave());
      await refreshModels();
      setRefreshMsg("success");
      void qc.invalidateQueries({ queryKey: ["provider"] });
      void qc.invalidateQueries({ queryKey: ["models"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "missing_api_key") {
        setRefreshMsg("missing");
      } else if (message === "unsupported_remote_models") {
        setRefreshMsg("unsupported");
      } else {
        setRefreshMsg("error");
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);

    try {
      await setProvider(providerPatchForSave());
      setSaveMsg("saved");
      void qc.invalidateQueries({ queryKey: ["provider"] });
      void qc.invalidateQueries({ queryKey: ["models"] });
    } catch {
      setSaveMsg("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
          {t("settings.provider.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.provider.description")}
        </p>
      </div>

      <Field label={t("settings.provider.profileLabel")}>
        <Select value={profileId} onValueChange={handleProfileChange}>
          <SelectTrigger
            aria-label={t("settings.provider.profileLabel")}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="start"
            side="bottom"
            position="popper"
            avoidCollisions={false}
            className="[&_[data-position=popper]]:!h-auto"
          >
            {data.builtIn.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">
              {t("settings.provider.profile.custom")}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field
        label={t("settings.provider.baseUrlLabel")}
        hint={t("settings.provider.baseUrlHint")}
      >
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={t("settings.provider.baseUrlPlaceholder")}
        />
      </Field>

      <Field label={t("settings.provider.apiKeyLabel")}>
        <div className="relative">
          <Input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={t("settings.apiKey.placeholder")}
            className="pr-10"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  showApiKey
                    ? t("settings.provider.hideApiKey")
                    : t("settings.provider.showApiKey")
                }
                aria-pressed={showApiKey}
                className="absolute top-1/2 right-1 -translate-y-1/2 active:!-translate-y-1/2"
                onClick={() => setShowApiKey((value) => !value)}
              >
                {showApiKey ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showApiKey
                ? t("settings.provider.hideApiKey")
                : t("settings.provider.showApiKey")}
            </TooltipContent>
          </Tooltip>
        </div>
      </Field>

      <Field label={t("settings.provider.modelLabel")}>
        <div className="flex items-center gap-2">
          <Select
            value={selectedModelValue}
            onValueChange={(v) => setSelectedModelId(v)}
          >
            <SelectTrigger
              aria-label={t("settings.provider.modelLabel")}
              className="w-full"
            >
              <SelectValue placeholder={t("settings.provider.modelPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {visibleModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => void handleRefreshModels()}
            disabled={refreshing}
          >
            {refreshing
              ? t("settings.provider.refreshingModels")
              : t("settings.provider.refreshModels")}
          </Button>
        </div>
        {refreshMsg === "success" && (
          <span className="text-sm text-muted-foreground">
            {t("settings.provider.refreshSuccess")}
          </span>
        )}
        {refreshMsg === "unsupported" && (
          <span className="text-sm text-destructive">
            {t("settings.provider.refreshUnsupported")}
          </span>
        )}
        {refreshMsg === "missing" && (
          <span className="text-sm text-destructive">
            {t("settings.provider.refreshMissingKey")}
          </span>
        )}
        {refreshMsg === "error" && (
          <span className="text-sm text-destructive">
            {t("settings.provider.refreshError")}
          </span>
        )}
        {data.current.remoteModelsFetchedAt && (
          <span className="text-xs text-muted-foreground">
            {t("settings.provider.lastRefreshed", {
              time: new Date(data.current.remoteModelsFetchedAt).toLocaleString(),
            })}
          </span>
        )}
      </Field>

      {data.current.agentRuntime && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <div className="font-medium text-foreground">
            {t("settings.provider.runtimeLabel")}
          </div>
          {data.current.agentRuntime.protocol === "anthropic" ? (
            <div>
              {t("settings.provider.runtimeAnthropic")}
              <span className="block text-xs text-muted-foreground">
                {t("settings.provider.runtimeBaseUrl", {
                  baseUrl: data.current.agentRuntime.baseUrl,
                })}
              </span>
            </div>
          ) : data.current.agentRuntime.protocol === "openai-compatible" ? (
            <div>
              {t("settings.provider.runtimeOpenAI")}
              <span className="block text-xs text-muted-foreground">
                {t("settings.provider.runtimeTextOnly")}
              </span>
            </div>
          ) : (
            <div>
              {t("settings.provider.runtimeUnsupported")}
              <span className="block text-xs text-muted-foreground">
                {data.current.agentRuntime.reason}
              </span>
            </div>
          )}
        </div>
      )}

      {compatibilityNote && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">
            {t("settings.provider.compatibilityNote")}:
          </span>{" "}
          {compatibilityNote}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {t("settings.provider.save")}
        </Button>
        {saveMsg === "saved" && (
          <span className="text-sm text-muted-foreground">
            {t("settings.provider.saved")}
          </span>
        )}
        {saveMsg === "error" && (
          <span className="text-sm text-destructive">
            {t("settings.provider.saveError")}
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </div>
  );
}
