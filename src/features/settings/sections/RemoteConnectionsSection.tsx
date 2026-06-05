import { Cable, FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  useChannelConnectionActions,
  useChannelConnections,
  useWeixinLogin,
} from "@/lib/data/channel-connections-queries";
import type { ChannelConnection } from "@/lib/data/channel-connections";

export function RemoteConnectionsSection() {
  const { t } = useTranslation();
  const { data: connections = [], isLoading } = useChannelConnections();
  const actions = useChannelConnectionActions();
  const weixinLogin = useWeixinLogin();

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
          {t("settings.remoteConnections.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.remoteConnections.description")}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FlaskConical className="size-4" />
            <span>WeChat</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => weixinLogin.start.mutate()}
          >
            {t("settings.remoteConnections.startWeixin")}
          </Button>
        </div>
        {weixinLogin.status ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t(`settings.remoteConnections.status.${weixinLogin.status.status}`)}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : connections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("settings.remoteConnections.empty")}
          </p>
        ) : (
          connections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              onEnable={() => actions.enable.mutate(connection.id)}
              onDisable={() => actions.disable.mutate(connection.id)}
              onFakeIncoming={() =>
                actions.fakeIncoming.mutate([
                  connection.id,
                  { chatId: "fake-chat", senderId: "fake-user", text: "ping" },
                ])
              }
            />
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("settings.remoteConnections.interactiveUnsupported")}
      </p>
    </section>
  );
}

function ConnectionRow(props: {
  connection: ChannelConnection;
  onEnable: () => void;
  onDisable: () => void;
  onFakeIncoming: () => void;
}) {
  const { t } = useTranslation();
  const { connection } = props;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cable className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-medium text-foreground">
              {connection.name}
            </h3>
            {connection.type === "weixin" ? (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {t("settings.remoteConnections.experimental")}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{connection.type}</span>
            <span>{connection.status}</span>
            <span>{t("settings.remoteConnections.autoExecute")}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connection.type === "fake" ? (
            <Button type="button" size="sm" variant="ghost" onClick={props.onFakeIncoming}>
              {t("settings.remoteConnections.fakeTrigger")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={connection.enabled ? "secondary" : "default"}
            onClick={connection.enabled ? props.onDisable : props.onEnable}
          >
            {connection.enabled
              ? t("settings.remoteConnections.disable")
              : t("settings.remoteConnections.enable")}
          </Button>
        </div>
      </div>
    </div>
  );
}
