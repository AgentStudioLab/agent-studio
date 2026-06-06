import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteProviderConnection,
  getProvider,
  getProviderConnection,
  type ProviderConnectionConfig,
} from "@/lib/data/settings";
import { ProviderConnectionDialog } from "./ProviderConnectionDialog";
import { ProviderConnectionList } from "./ProviderConnectionList";

export function ModelSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["provider"],
    queryFn: getProvider,
    staleTime: 60 * 1000,
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
    const connection = await getProviderConnection(id);
    setEditingConnection(connection);
    setDialogMode("edit");
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteMsg(null);
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

      <ProviderConnectionList
        connections={data.connections ?? []}
        defaultSelection={data.defaultSelection ?? null}
        onAdd={openCreate}
        onEdit={(id) => void openEdit(id)}
        onDelete={(id) => void handleDelete(id)}
        labels={{
          title: t("settings.provider.connectionsTitle"),
          add: t("settings.provider.addModel"),
          edit: t("settings.provider.edit"),
          delete: t("settings.provider.delete"),
          default: t("settings.provider.defaultModelBadge"),
          enabledModels: t("settings.provider.enabledModels"),
          disabled: t("settings.provider.disabled"),
          missingKey: t("settings.provider.missingApiKey"),
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
        }}
      />
    </section>
  );
}
