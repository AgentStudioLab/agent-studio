import { Cable } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  useChannelConnectionActions,
  useChannelConnections,
  useWeixinLogin,
} from "@/lib/data/channel-connections-queries";
import type { ChannelConnection, WeixinLoginStatus } from "@/lib/data/channel-connections";

export function RemoteConnectionsSection() {
  const { t } = useTranslation();
  const { data: connections = [], isLoading } = useChannelConnections();
  const actions = useChannelConnectionActions();
  const weixinLogin = useWeixinLogin();
  const visibleConnections = normalizeRemoteConnections(connections);
  const hasWeixinConnection = visibleConnections.some((connection) => connection.type === "weixin");

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
          {t("settings.remoteConnections.title")}
        </h2>
      </div>

      {!hasWeixinConnection ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Cable className="size-4" />
              <span>{t("settings.remoteConnections.addWeixin")}</span>
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
          {weixinLogin.status ? <WeixinLoginStatusPanel status={weixinLogin.status} /> : null}
        </div>
      ) : null}

      {hasWeixinConnection && weixinLogin.status ? (
        <WeixinLoginStatusPanel status={weixinLogin.status} />
      ) : null}

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : visibleConnections.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("settings.remoteConnections.empty")}
          </p>
        ) : (
          visibleConnections.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              onEnable={() => actions.enable.mutate(connection.id)}
              onDisable={() => actions.disable.mutate(connection.id)}
              onReconnectWeixin={() => weixinLogin.start.mutate()}
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

function normalizeRemoteConnections(connections: ChannelConnection[]): ChannelConnection[] {
  const weixin = connections.find((connection) => connection.type === "weixin" && connection.status === "running")
    ?? connections.find((connection) => connection.type === "weixin");
  return connections.filter((connection) => connection.type !== "weixin" || connection.id === weixin?.id);
}

function WeixinLoginStatusPanel({ status }: { status: WeixinLoginStatus }) {
  const { t } = useTranslation();
  const rawQr = "qrData" in status ? status.qrData : null;
  const qrValue = "qrUrl" in status && status.qrUrl ? status.qrUrl : rawQr;

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(`settings.remoteConnections.status.${status.status}`)}
      </p>
      {qrValue ? (
        <div className="inline-flex rounded-lg border border-border bg-background p-3">
          <QRCodeSVG
            value={qrValue}
            size={160}
            role="img"
            aria-label={t("settings.remoteConnections.weixinQrAlt")}
          />
        </div>
      ) : null}
    </div>
  );
}

function ConnectionRow(props: {
  connection: ChannelConnection;
  onEnable: () => void;
  onDisable: () => void;
  onReconnectWeixin: () => void;
  onFakeIncoming: () => void;
}) {
  const { t } = useTranslation();
  const { connection } = props;
  const connectionName =
    connection.type === "weixin"
      ? t("settings.remoteConnections.weixinName")
      : connection.name;
  const shouldReconnectWeixin =
    connection.type === "weixin" &&
    (!connection.enabled || connection.status === "stopped" || connection.status === "error");
  const actionLabel = shouldReconnectWeixin
    ? t("settings.remoteConnections.reconnectWeixin")
    : connection.enabled
      ? t("settings.remoteConnections.disable")
      : t("settings.remoteConnections.enable");
  const actionHandler = shouldReconnectWeixin
    ? props.onReconnectWeixin
    : connection.enabled
      ? props.onDisable
      : props.onEnable;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cable className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="truncate text-sm font-medium text-foreground">
              {connectionName}
            </h3>
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
            onClick={actionHandler}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
