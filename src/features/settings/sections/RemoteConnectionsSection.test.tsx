import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";

notifyManager.setScheduler(queueMicrotask);

let connectionsState: unknown[] = [];
let loginState: unknown = null;

mock.module("@/lib/data/channel-connections-queries", () => ({
  useChannelConnections: () => ({
    data: connectionsState,
    isLoading: false,
  }),
  useChannelConnectionActions: () => ({
    enable: { mutate: () => {} },
    disable: { mutate: () => {} },
    update: { mutate: () => {} },
    fakeIncoming: { mutate: () => {} },
  }),
  useWeixinLogin: () => ({
    start: { mutate: () => {} },
    status: loginState,
  }),
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.remoteConnections.title": "Remote Connections",
        "settings.remoteConnections.description":
          "Experimental WeChat adapter requires manual smoke testing. Automated E2E uses Fake Channel.",
        "settings.remoteConnections.empty": "No remote connections yet.",
        "settings.remoteConnections.permissionStrategy": "Permission strategy",
        "settings.remoteConnections.autoExecute": "Auto execute",
        "settings.remoteConnections.interactiveUnsupported":
          "Interactive approval is not supported",
        "settings.remoteConnections.enable": "Enable",
        "settings.remoteConnections.disable": "Disable",
        "settings.remoteConnections.fakeTrigger": "Send fake incoming",
        "settings.remoteConnections.startWeixin": "Start WeChat login",
        "settings.remoteConnections.experimental": "Experimental",
        "settings.remoteConnections.status.waiting": "Waiting for scan",
        "settings.remoteConnections.status.scanned": "Scanned",
        "settings.remoteConnections.status.confirmed": "Confirmed",
        "settings.remoteConnections.status.error": "Login error",
      };
      return translations[key] ?? key;
    },
  }),
}));

const { RemoteConnectionsSection } =
  require("./RemoteConnectionsSection") as typeof import("./RemoteConnectionsSection");

function renderSection() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <RemoteConnectionsSection />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("RemoteConnectionsSection", () => {
  it("shows the empty state and experimental warning copy", () => {
    connectionsState = [];
    loginState = null;

    renderSection();

    expect(screen.getByText("Remote Connections")).toBeTruthy();
    expect(
      screen.getByText(
        "Experimental WeChat adapter requires manual smoke testing. Automated E2E uses Fake Channel.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No remote connections yet.")).toBeTruthy();
  });

  it("shows fake running and weixin experimental rows", () => {
    connectionsState = [
      {
        id: "fake_1",
        type: "fake",
        name: "Fake Channel",
        enabled: true,
        status: "running",
        config: { permissionStrategy: "auto_execute" },
      },
      {
        id: "wx_1",
        type: "weixin",
        name: "WeChat",
        enabled: false,
        status: "stopped",
        config: { permissionStrategy: "auto_execute" },
      },
    ];

    renderSection();

    expect(screen.getByText("Fake Channel")).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getAllByText("WeChat").length).toBeGreaterThan(0);
    expect(screen.getByText("Experimental")).toBeTruthy();
    expect(screen.getAllByText("Auto execute")).toHaveLength(2);
    expect(screen.getByText("Interactive approval is not supported")).toBeTruthy();
  });

  it("renders QR login statuses", () => {
    connectionsState = [];
    loginState = { status: "scanned" };

    renderSection();

    expect(screen.getByText("Scanned")).toBeTruthy();
  });
});
