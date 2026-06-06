import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

notifyManager.setScheduler(queueMicrotask);

let connectionsState: unknown[] = [];
let loginState: unknown = null;
let enableCalls: string[] = [];
let weixinLoginStartCalls = 0;

mock.module("@/lib/data/channel-connections-queries", () => ({
  useChannelConnections: () => ({
    data: connectionsState,
    isLoading: false,
  }),
  useChannelConnectionActions: () => ({
    enable: { mutate: (id: string) => enableCalls.push(id) },
    disable: { mutate: () => {} },
    update: { mutate: () => {} },
    fakeIncoming: { mutate: () => {} },
  }),
  useWeixinLogin: () => ({
    start: { mutate: () => { weixinLoginStartCalls += 1; } },
    status: loginState,
  }),
}));

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "settings.remoteConnections.title": "Remote Connections",
        "settings.remoteConnections.empty": "No remote connections yet.",
        "settings.remoteConnections.permissionStrategy": "Permission strategy",
        "settings.remoteConnections.autoExecute": "Auto execute",
        "settings.remoteConnections.interactiveUnsupported":
          "Interactive approval is not supported",
        "settings.remoteConnections.enable": "Enable",
        "settings.remoteConnections.disable": "Disable",
        "settings.remoteConnections.fakeTrigger": "Send fake incoming",
        "settings.remoteConnections.startWeixin": "Start WeChat login",
        "settings.remoteConnections.reconnectWeixin": "Reconnect WeChat",
        "settings.remoteConnections.addWeixin": "Add WeChat connection",
        "settings.remoteConnections.weixinName": "WeChat",
        "settings.remoteConnections.weixinQrAlt": "WeChat login QR code",
        "settings.remoteConnections.status.waiting": "Waiting for scan",
        "settings.remoteConnections.status.scanned": "Scanned",
        "settings.remoteConnections.status.confirmed": "Confirmed",
        "settings.remoteConnections.status.error": "Login error",
        "task.askUser.pageOf": `${String(params?.page ?? "")} of ${String(params?.total ?? "")}`,
        "task.askUser.somethingElse": "Something else",
        "task.askUser.somethingElsePlaceholder": "type",
        "task.askUser.selectedCount": `${String(params?.count ?? "")} selected`,
        "task.askUser.skip": "Skip",
        "task.askUser.send": "Send",
        "task.askUser.next": "Next",
        "task.askUser.close": "Close",
        "task.askUser.prevPage": "Prev",
        "task.askUser.nextPage": "Next page",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("qrcode.react", () => ({
  QRCodeSVG: (props: {
    value: string;
    role?: string;
    "aria-label"?: string;
  }) => (
    <svg
      role={props.role}
      aria-label={props["aria-label"]}
      data-qr-value={props.value}
    />
  ),
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

afterEach(() => {
  cleanup();
  enableCalls = [];
  weixinLoginStartCalls = 0;
});

describe("RemoteConnectionsSection", () => {
  it("shows the empty state without the removed remote connection warning", () => {
    connectionsState = [];
    loginState = null;

    renderSection();

    expect(screen.getByText("Remote Connections")).toBeTruthy();
    expect(
      screen.queryByText(
        "Experimental WeChat adapter requires manual smoke testing. Automated E2E uses Fake Channel.",
      ),
    ).toBeNull();
    expect(screen.queryByText("settings.remoteConnections.description")).toBeNull();
    expect(screen.getByText("No remote connections yet.")).toBeTruthy();
  });

  it("shows fake running and localized weixin rows without experimental badges", () => {
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
        name: "Raw Backend Weixin",
        enabled: false,
        status: "stopped",
        config: { permissionStrategy: "auto_execute" },
      },
    ];

    renderSection();

    expect(screen.getByText("Fake Channel")).toBeTruthy();
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByText("WeChat")).toBeTruthy();
    expect(screen.queryByText("Raw Backend Weixin")).toBeNull();
    expect(screen.queryByText("Experimental")).toBeNull();
    expect(screen.queryByText("settings.remoteConnections.experimental")).toBeNull();
    expect(screen.getAllByText("Auto execute")).toHaveLength(2);
    expect(screen.getByText("Interactive approval is not supported")).toBeTruthy();
  });

  it("uses WeChat QR login from a stopped WeChat row instead of enabling stale credentials", () => {
    connectionsState = [
      {
        id: "wx_1",
        type: "weixin",
        name: "WeChat",
        enabled: false,
        status: "stopped",
        config: { permissionStrategy: "auto_execute" },
      },
    ];
    loginState = null;

    renderSection();

    screen.getByRole("button", { name: "Reconnect WeChat" }).click();
    expect(weixinLoginStartCalls).toBe(1);
    expect(enableCalls).toEqual([]);
  });

  it("does not render a second WeChat start card when a WeChat connection exists", () => {
    connectionsState = [
      {
        id: "wx_1",
        type: "weixin",
        name: "WeChat",
        enabled: true,
        status: "running",
        config: { permissionStrategy: "auto_execute" },
      },
    ];
    loginState = null;

    renderSection();

    expect(screen.queryByText("Add WeChat connection")).toBeNull();
    expect(screen.getAllByText("WeChat")).toHaveLength(1);
  });

  it("shows only one WeChat row when older data contains duplicate WeChat connections", () => {
    connectionsState = [
      {
        id: "wx_1",
        type: "weixin",
        name: "WeChat",
        enabled: true,
        status: "running",
        config: { permissionStrategy: "auto_execute" },
      },
      {
        id: "wx_2",
        type: "weixin",
        name: "WeChat",
        enabled: false,
        status: "stopped",
        config: { permissionStrategy: "auto_execute" },
      },
    ];
    loginState = null;

    renderSection();

    expect(screen.getAllByText("WeChat")).toHaveLength(1);
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("renders QR login statuses", () => {
    connectionsState = [];
    loginState = { status: "scanned" };

    renderSection();

    expect(screen.getByText("Scanned")).toBeTruthy();
  });

  it("renders a generated WeChat login QR code from qrUrl", () => {
    connectionsState = [];
    loginState = {
      status: "waiting",
      qrUrl: "https://qr.example/page",
      qrData: "raw-qr-token",
    };

    renderSection();

    const qr = screen.getByRole("img", { name: "WeChat login QR code" });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(qr.getAttribute("data-qr-value")).toBe("https://qr.example/page");
  });

  it("renders a generated WeChat login QR code when only qrData is available", () => {
    connectionsState = [];
    loginState = {
      status: "waiting",
      qrData: "weixin://scan/token",
    };

    renderSection();

    const qr = screen.getByRole("img", { name: "WeChat login QR code" });
    expect(qr.tagName.toLowerCase()).toBe("svg");
    expect(qr.getAttribute("data-qr-value")).toBe("weixin://scan/token");
  });
});
