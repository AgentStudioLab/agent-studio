import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteProviderConnection,
  getProvider,
  getProviderConnection,
  setDefaultProviderSelection,
  setProviderConnectionEnabledModels,
  type ProviderConnectionConfig,
  type ProviderConnectionSummary,
} from "@/lib/data/settings";
import { ProviderConnectionDialog } from "./ProviderConnectionDialog";
import { ProviderConnectionList } from "./ProviderConnectionList";
import { CcrRuntimeStatus } from "./CcrRuntimeStatus";

export function ModelSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["provider"],
    queryFn: getProvider,
    staleTime: 60 * 1000,
    refetchInterval: (query) =>
      query.state.data?.ccrStatus?.phase === "applying" ? 1_000 : false,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingConnection, setEditingConnection] =
    useState<ProviderConnectionConfig | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const invalidateProviderAndModels = () => {
    void qc.invalidateQueries({ queryKey: ["provider"] });
    void qc.invalidateQueries({ queryKey: ["models"] });
  };

  const openCreate = () => {
    setDeleteMsg(null);
    setEditingConnection(null);
    setDialogMode("create");
    setDialogOpen(true);
  };

  const openEdit = async (id: string) => {
    setDeleteMsg(null);
    const summary = data?.connections?.find((connection) => connection.id === id);
    if (summary?.managed) return;
    const connection = await getProviderConnection(id);
    if (connection.managed) return;
    setEditingConnection(connection);
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteMsg(null);
    const summary = data?.connections?.find((connection) => connection.id === id);
    if (summary?.managed) return;
    try {
      await deleteProviderConnection(id);
      invalidateProviderAndModels();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setDeleteMsg(
        message === "cannot_delete_last_connection"
          ? t("settings.provider.connectionDeleteLastError")
          : t("settings.provider.saveError"),
      );
    }
  };

  const handleSetDefault = async (connection: ProviderConnectionSummary) => {
    try {
      const detail = await getProviderConnection(connection.id);
      const modelId =
        detail.defaultModelId ??
        detail.enabledModelIds[0] ??
        detail.models[0]?.id ??
        null;
      if (!modelId) return;
      if (!detail.enabledModelIds.includes(modelId)) {
        await setProviderConnectionEnabledModels(detail.providerId, {
          modelIds: [modelId],
          defaultModelId: modelId,
        });
      }
      await setDefaultProviderSelection({
        providerId: connection.id,
        modelId,
      });
      invalidateProviderAndModels();
    } catch {
      setDeleteMsg(t("settings.provider.defaultProviderError"));
    }
  };

  if (isLoading || !data) {
    return (
      <section>
        <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
          {t("settings.provider.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">...</p>
      </section>
    );
  }

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

      <CcrRuntimeStatus status={data.ccrStatus} />

      <ProviderConnectionList
        connections={data.connections ?? []}
        defaultSelection={data.defaultSelection ?? null}
        onAdd={openCreate}
        onEdit={(id) => void openEdit(id)}
        onDelete={(id) => void handleDelete(id)}
        onSetDefault={(connection) => void handleSetDefault(connection)}
        labels={{
          title: t("settings.provider.connectionsTitle"),
          add: t("settings.provider.addModel"),
          edit: t("settings.provider.edit"),
          delete: t("settings.provider.delete"),
          default: t("settings.provider.defaultModelBadge"),
          setDefault: t("settings.provider.setDefault"),
          enabledModels: t("settings.provider.enabledModels"),
          disabled: t("settings.provider.disabled"),
          missingKey: t("settings.provider.missingApiKey"),
          managed: t("settings.provider.managed"),
        }}
      />

      {deleteMsg && <p className="text-sm text-destructive">{deleteMsg}</p>}

      <ProviderConnectionDialog
        open={dialogOpen}
        mode={dialogMode}
        connection={editingConnection}
        builtIn={data.builtIn}
        onOpenChange={setDialogOpen}
        onSaved={invalidateProviderAndModels}
        labels={{
          addTitle: t("settings.provider.connectionAddTitle"),
          editTitle: t("settings.provider.connectionEditTitle"),
          description: t("settings.provider.connectionDialogDescription"),
          name: t("settings.provider.connectionNameLabel"),
          provider: t("settings.provider.profileLabel"),
          custom: t("settings.provider.profile.custom"),
          protocol: t("settings.provider.customProtocolLabel"),
          protocolOpenAIChat: t("settings.provider.customProtocolOpenAIChat"),
          protocolOpenAIResponses: t("settings.provider.customProtocolOpenAIResponses"),
          protocolAnthropic: t("settings.provider.customProtocolAnthropic"),
          baseUrl: t("settings.provider.baseUrlLabel"),
          baseUrlPlaceholder: t("settings.provider.baseUrlPlaceholder"),
          apiKey: t("settings.provider.apiKeyLabel"),
          apiKeyPlaceholder: t("settings.apiKey.placeholder"),
          showApiKey: t("settings.provider.showApiKey"),
          hideApiKey: t("settings.provider.hideApiKey"),
          enabled: t("settings.provider.connectionEnabled"),
          refresh: t("settings.provider.refreshModels"),
          refreshing: t("settings.provider.refreshingModels"),
          refreshSuccess: t("settings.provider.refreshSuccess"),
          refreshError: t("settings.provider.refreshError"),
          missingKey: t("settings.provider.refreshMissingKey"),
          unsupported: t("settings.provider.refreshUnsupported"),
          save: t("settings.provider.save"),
          cancel: t("settings.provider.cancel"),
          saved: t("settings.provider.saved"),
          saveError: t("settings.provider.saveError"),
          models: t("settings.provider.modelsLabel"),
          modelSearch: t("settings.provider.modelSearch"),
          modelEmpty: t("settings.provider.modelEmpty"),
          defaultModel: t("settings.provider.defaultModelBadge"),
          setDefaultModel: t("settings.provider.setDefault"),
        }}
      />
    </section>
  );
}
