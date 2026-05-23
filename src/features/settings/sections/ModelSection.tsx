import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProvider,
  setProvider,
  type ProfileId,
  type ProfileModel,
} from "@/lib/data/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ModelSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
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
  const [customModelsText, setCustomModelsText] = useState("");
  const [saveMsg, setSaveMsg] = useState<"saved" | "error" | "invalid" | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProfileIdLocal(data.current.profileId);
    setBaseUrl(data.current.baseUrl);
    setApiKey(data.current.apiKey);
    setCustomModelsText(
      data.current.profileId === "custom"
        ? JSON.stringify(data.current.models, null, 2)
        : "",
    );
  }, [data]);

  if (isLoading || !data || profileId === null) {
    return (
      <section>
        <h2 className="text-[18px] font-semibold text-foreground">
          {t("settings.provider.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">…</p>
      </section>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);

    let customModels: ProfileModel[] | undefined;
    if (profileId === "custom") {
      try {
        const parsed = JSON.parse(customModelsText || "[]") as unknown;
        if (!Array.isArray(parsed)) throw new Error("not_array");
        const cleaned: ProfileModel[] = [];
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const r = item as Record<string, unknown>;
          if (
            typeof r.id !== "string" ||
            typeof r.displayName !== "string" ||
            typeof r.description !== "string"
          ) {
            continue;
          }
          cleaned.push({
            id: r.id,
            displayName: r.displayName,
            description: r.description,
          });
        }
        customModels = cleaned;
      } catch {
        setSaveMsg("invalid");
        setSaving(false);
        return;
      }
    }

    try {
      await setProvider({
        profileId,
        baseUrl,
        apiKey,
        ...(customModels ? { customModels } : {}),
      });
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
        <h2 className="text-[18px] font-semibold text-foreground">
          {t("settings.provider.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.provider.description")}
        </p>
      </div>

      <Field label={t("settings.provider.profileLabel")}>
        <Select
          value={profileId}
          onValueChange={(v) => setProfileIdLocal(v as ProfileId)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anthropic">
              {t("settings.provider.profile.anthropic")}
            </SelectItem>
            <SelectItem value="deepseek">
              {t("settings.provider.profile.deepseek")}
            </SelectItem>
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
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={t("settings.apiKey.placeholder")}
        />
      </Field>

      {profileId === "custom" && (
        <Field
          label={t("settings.provider.customModelsLabel")}
          hint={t("settings.provider.customModelsHint")}
        >
          <Textarea
            value={customModelsText}
            onChange={(e) => setCustomModelsText(e.target.value)}
            placeholder={t("settings.provider.customModelsPlaceholder")}
            rows={6}
            className="font-mono text-[12px]"
          />
        </Field>
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
        {saveMsg === "invalid" && (
          <span className="text-sm text-destructive">
            {t("settings.provider.invalidJson")}
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
