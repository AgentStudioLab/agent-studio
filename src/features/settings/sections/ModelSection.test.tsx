import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  CcrRuntimeApplyError as CcrRuntimeApplyErrorType,
  ProviderConnectionConfig,
  ProviderState,
} from "@/lib/data/settings";

notifyManager.setScheduler(queueMicrotask);

const getProviderMock = mock(async () => providerState);
const getProviderConnectionMock = mock(async (id: string) => {
  const connection = providerConnections[id];
  if (!connection) throw new Error("provider_connection_not_found");
  return connection;
});
const createProviderConnectionMock = mock(async () => ({
  ...providerState,
  connection: providerConnections["conn-openai"],
}));
const updateProviderConnectionMock = mock(async (id: string) => ({
  ...providerState,
  connection: providerConnections[id],
}));
const deleteProviderConnectionMock = mock(async () => providerState);
const refreshProviderConnectionModelsMock = mock(async (id: string) => ({
  ...providerState,
  connection: providerConnections[id],
}));
const setProviderConnectionEnabledModelsMock = mock(async (id: string) => ({
  ...providerState,
  connection: {
    ...providerConnections[id],
    enabledModelIds:
      id === "conn-sf" ? ["deepseek-ai/DeepSeek-V3.2"] : providerConnections[id]?.enabledModelIds,
    defaultModelId:
      id === "conn-sf" ? "deepseek-ai/DeepSeek-V3.2" : providerConnections[id]?.defaultModelId,
  },
}));
const setDefaultProviderSelectionMock = mock(async () => providerState);
const applyCcrRuntimeRoutesMock = mock(async () => providerState.ccrStatus!);
class CcrRuntimeApplyErrorMock extends Error {
  constructor(
    message: string,
    public readonly ccrStatus?: ProviderState["ccrStatus"],
  ) {
    super(message);
  }
}

let providerState: ProviderState;
let providerConnections: Record<string, ProviderConnectionConfig>;

mock.module("@/lib/data/settings", () => ({
  getProvider: getProviderMock,
  getProviderConnection: getProviderConnectionMock,
  createProviderConnection: createProviderConnectionMock,
  updateProviderConnection: updateProviderConnectionMock,
  deleteProviderConnection: deleteProviderConnectionMock,
  refreshProviderConnectionModels: refreshProviderConnectionModelsMock,
  setProviderConnectionEnabledModels: setProviderConnectionEnabledModelsMock,
  setDefaultProviderSelection: setDefaultProviderSelectionMock,
  applyCcrRuntimeRoutes: applyCcrRuntimeRoutesMock,
  CcrRuntimeApplyError: CcrRuntimeApplyErrorMock as unknown as typeof CcrRuntimeApplyErrorType,
}));

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children: ReactNode;
  }) => (open ? <div>{children}</div> : null),
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div data-testid="dialog-content" data-class-name={className ?? ""}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

mock.module("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    "aria-label": ariaLabel,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    "aria-label"?: string;
  }) => (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

mock.module("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

mock.module("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
    disabled,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: ReactNode;
    disabled?: boolean;
  }) => (
    <div data-select-value={value} data-disabled={String(disabled)}>
      <div>{children}</div>
      <div data-testid="select-actions">
        {onValueChange &&
          flattenSelectItems(children).map(({ value: itemValue, label }) => (
            <button
              key={itemValue}
              type="button"
              onClick={() => onValueChange(itemValue)}
            >
              {label}
            </button>
          ))}
      </div>
    </div>
  ),
  SelectContent: ({
    children,
    position,
    side,
    align,
    className,
    avoidCollisions,
  }: {
    children: ReactNode;
    position?: string;
    side?: string;
    align?: string;
    className?: string;
    avoidCollisions?: boolean;
  }) => (
    <div
      data-testid="select-content"
      data-position={position ?? ""}
      data-side={side ?? ""}
      data-align={align ?? ""}
      data-class-name={className ?? ""}
      data-avoid-collisions={String(avoidCollisions)}
    >
      {children}
    </div>
  ),
  SelectItem: ({ children }: { value: string; children: ReactNode }) => (
    <span>{children}</span>
  ),
  SelectTrigger: ({
    children,
    ...props
  }: {
    children: ReactNode;
    "aria-label"?: string;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
}));

function flattenSelectItems(
  children: ReactNode,
): { value: string; label: string }[] {
  const React = require("react") as typeof import("react");
  const items: { value: string; label: string }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string; children?: ReactNode };
    if (typeof props.value === "string") {
      items.push({ value: props.value, label: String(props.children) });
    }
    items.push(...flattenSelectItems(props.children));
  });
  return items;
}

const testI18n = i18n.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "en",
  initImmediate: false,
  resources: {
    en: {
      translation: {
        settings: {
          apiKey: { placeholder: "sk-ant-..." },
          provider: {
            title: "Model Provider",
            description: "Manage provider connections",
            connectionsTitle: "Provider connections",
            addModel: "Add model",
            edit: "Edit",
            delete: "Delete",
            cancel: "Cancel",
            defaultModelBadge: "Default",
            setDefault: "Set default",
            defaultProviderError: "Default provider failed",
            enabledModels: "Enabled models",
            disabled: "Disabled",
            missingApiKey: "Missing key",
            managed: "Official",
            connectionAddTitle: "Add model provider",
            connectionEditTitle: "Edit model provider",
            connectionDialogDescription: "Configure endpoint",
            connectionNameLabel: "Connection name",
            profileLabel: "Provider",
            profile: { custom: "Custom" },
            customProtocolLabel: "Protocol",
            customProtocolOpenAIChat: "OpenAI Chat Completions",
            customProtocolOpenAIResponses: "OpenAI Responses",
            customProtocolAnthropic: "Anthropic Messages-compatible",
            baseUrlLabel: "Base URL",
            baseUrlPlaceholder: "https://api.example.com",
            apiKeyLabel: "API Key",
            showApiKey: "Show API key",
            hideApiKey: "Hide API key",
            connectionEnabled: "Enabled for conversations",
            refreshModels: "Refresh models",
            refreshingModels: "Refreshing...",
            refreshSuccess: "Model list refreshed",
            refreshError: "Model refresh failed",
            refreshMissingKey: "Enter an API key first",
            refreshUnsupported: "Unsupported",
            save: "Save",
            saved: "Saved",
            saveError: "Save failed",
            connectionDeleteLastError: "Keep at least one connection",
            modelsLabel: "Models",
            modelSearch: "Search models",
            modelEmpty: "No models found",
            defaultModelLabel: "Default model",
            ccrReady: "CCR ready, {{count}} model routes applied",
            ccrApplying:
              "Applying model routes. OpenAI-compatible conversations are temporarily unavailable.",
            ccrError: "CCR failed to start: {{message}}",
            ccrDisabled: "CCR disabled",
            ccrRetry: "Retry",
          },
        },
      },
    },
  },
});

function renderModelSection(provider: ProviderState) {
  providerState = provider;
  providerConnections = Object.fromEntries(
    (provider.connections ?? []).map((summary) => [
      summary.id,
      connectionFixture(summary.id),
    ]),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = mock(qc.invalidateQueries.bind(qc));
  qc.invalidateQueries = invalidateQueries as typeof qc.invalidateQueries;

  const view = render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={testI18n}>
        <TooltipProvider>
          <ModelSection />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );

  return { ...view, invalidateQueries };
}

function providerFixture(): ProviderState {
  return {
    version: 3,
    defaultSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
    current: {
      presetId: "conn-openai",
      presetName: "OpenAI",
      profileId: "openai",
      label: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      models: [],
      remoteModelsFetchedAt: "",
      selectedModelId: "gpt-5.1",
      supportsRemoteModels: true,
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    },
    activePresetId: "conn-openai",
    presets: [],
    connections: [
      {
        id: "conn-openai",
        name: "OpenAI",
        profileId: "openai",
        providerLabel: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        enabled: true,
        hasApiKey: true,
        modelCount: 2,
        enabledModelCount: 1,
        defaultModelId: "gpt-5.1",
        remoteModelsFetchedAt: "",
        supportsRemoteModels: true,
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
      {
        id: "conn-sf",
        name: "SiliconFlow",
        profileId: "siliconflow-cn",
        providerLabel: "硅基流动（中国）",
        baseUrl: "https://api.siliconflow.cn/v1",
        enabled: true,
        hasApiKey: true,
        modelCount: 1,
        enabledModelCount: 0,
        defaultModelId: null,
        remoteModelsFetchedAt: "",
        supportsRemoteModels: true,
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.siliconflow.cn/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
    ],
    enabledModels: [
      {
        providerId: "conn-openai",
        providerName: "OpenAI",
        providerLabel: "OpenAI",
        modelId: "gpt-5.1",
        modelLabel: "GPT-5.1",
        modelDescription: "Flagship",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      },
    ],
    builtIn: [
      {
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        supportsRemoteModels: true,
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
        models: [
          { id: "gpt-5.1", displayName: "GPT-5.1", description: "Flagship" },
          {
            id: "gpt-5.1-mini",
            displayName: "GPT-5.1 Mini",
            description: "Fast",
          },
        ],
      },
      {
        id: "siliconflow-cn",
        label: "硅基流动（中国）",
        baseUrl: "https://api.siliconflow.cn/v1",
        supportsRemoteModels: true,
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.siliconflow.cn/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
        models: [
          {
            id: "deepseek-ai/DeepSeek-V3.2",
            displayName: "DeepSeek V3.2",
            description: "Remote",
          },
        ],
      },
    ],
  };
}

function providerFixtureWithAnthropicFirst(): ProviderState {
  const provider = providerFixture();
  const anthropicRuntime = {
    protocol: "anthropic" as const,
    baseUrl: "https://api.anthropic.com",
    auth: "x-api-key" as const,
    capabilities: { text: true, tools: true, fileCheckpoint: true },
  };
  return {
    ...provider,
    builtIn: [
      {
        id: "anthropic",
        label: "Anthropic",
        baseUrl: "https://api.anthropic.com",
        supportsRemoteModels: true,
        agentRuntime: anthropicRuntime,
        models: [
          {
            id: "claude-sonnet-4-6",
            displayName: "Sonnet 4.6",
            description: "Responsive everyday work",
          },
        ],
      },
      ...provider.builtIn,
    ],
  };
}

function officialConnectionSummary() {
  return {
    id: "official",
    name: "官方服务商",
    profileId: "custom",
    providerLabel: "官方服务商",
    managed: true,
    baseUrl: "",
    enabled: true,
    hasApiKey: false,
    modelCount: 1,
    enabledModelCount: 1,
    defaultModelId: "gpt-5.1",
    remoteModelsFetchedAt: "",
    customProtocol: "openai-chat-completions",
    supportsRemoteModels: true,
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  };
}

function officialEnabledModel() {
  return {
    providerId: "official",
    providerName: "官方服务商",
    providerLabel: "官方服务商",
    managed: true,
    modelId: "gpt-5.1",
    modelLabel: "GPT-5.1",
    modelDescription: "Official model",
    customProtocol: "openai-chat-completions",
    agentRuntime: {
      protocol: "openai-compatible",
      baseUrl: "",
      auth: "bearer",
      capabilities: { text: true, tools: false, fileCheckpoint: false },
    },
  };
}

function connectionFixture(id: string): ProviderConnectionConfig {
  if (id === "official") {
    return {
      presetId: "official",
      presetName: "官方服务商",
      providerId: "official",
      providerName: "官方服务商",
      profileId: "custom",
      label: "官方服务商",
      baseUrl: "",
      apiKey: "",
      customProtocol: "openai-chat-completions",
      enabled: true,
      managed: true,
      models: [
        { id: "gpt-5.1", displayName: "GPT-5.1", description: "Official model" },
      ],
      remoteModelsFetchedAt: "",
      selectedModelId: "gpt-5.1",
      enabledModelIds: ["gpt-5.1"],
      defaultModelId: "gpt-5.1",
      supportsRemoteModels: true,
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    };
  }
  const provider = providerFixture();
  const summary = provider.connections?.find((entry) => entry.id === id);
  if (!summary) throw new Error("missing fixture");
  const builtIn =
    provider.builtIn.find((entry) => entry.id === summary.profileId) ??
    provider.builtIn.find((entry) => entry.id === "siliconflow-cn");
  return {
    presetId: summary.id,
    presetName: summary.name,
    providerId: summary.id,
    providerName: summary.name,
    profileId: summary.profileId,
    label: summary.providerLabel,
    baseUrl: summary.baseUrl,
    apiKey: `${summary.id}-key`,
    enabled: summary.enabled,
    models: builtIn?.models ?? [],
    remoteModelsFetchedAt: summary.remoteModelsFetchedAt,
    selectedModelId: summary.defaultModelId,
    enabledModelIds:
      id === "conn-openai" ? ["gpt-5.1"] : [],
    defaultModelId: summary.defaultModelId,
    supportsRemoteModels: summary.supportsRemoteModels,
    agentRuntime: summary.agentRuntime,
  };
}

afterEach(() => {
  cleanup();
  getProviderMock.mockClear();
  getProviderConnectionMock.mockClear();
  createProviderConnectionMock.mockClear();
  updateProviderConnectionMock.mockClear();
  deleteProviderConnectionMock.mockClear();
  refreshProviderConnectionModelsMock.mockClear();
  setProviderConnectionEnabledModelsMock.mockClear();
  setDefaultProviderSelectionMock.mockClear();
  applyCcrRuntimeRoutesMock.mockClear();
});

import { ModelSection } from "./ModelSection";

describe("ModelSection", () => {
  it("renders provider connection rows and no flat provider form", async () => {
    renderModelSection(providerFixture());

    expect(await screen.findByText("Provider connections")).toBeDefined();
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    expect(screen.getByText("SiliconFlow")).toBeDefined();
    expect(screen.queryByLabelText("Provider")).toBeNull();
  });

  it("styles the default provider badge with the success palette", async () => {
    renderModelSection(providerFixture());

    const badge = await screen.findByText("Default");

    expect(badge.className).toContain("bg-success-100/15");
    expect(badge.className).toContain("text-success-100");
    expect(badge.className).toContain("hover:bg-success-100/15");
    expect(badge.className).toContain("hover:text-success-100");
  });

  it("locks managed official provider rows", async () => {
    const provider = providerFixture();
    provider.connections = [
      officialConnectionSummary(),
      ...(provider.connections ?? []),
    ] as never;
    provider.enabledModels = [
      officialEnabledModel(),
      ...(provider.enabledModels ?? []),
    ] as never;

    renderModelSection(provider);

    expect((await screen.findAllByText("官方服务商")).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Edit 官方服务商" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete 官方服务商" }),
    ).toBeNull();
    expect(screen.queryByText("Missing key")).toBeNull();
  });

  it("shows CCR ready status for OpenAI-compatible routes", async () => {
    const provider = providerFixture();
    provider.ccrStatus = {
      enabled: true,
      phase: "ready",
      baseUrl: "http://127.0.0.1:3456",
      routeCount: 2,
      routeKeys: [
        "agentstudio/conn-openai/gpt-5.1",
        "agentstudio/conn-openai/gpt-5.1-mini",
      ],
    };

    renderModelSection(provider);

    expect(
      await screen.findByText("CCR ready, 2 model routes applied"),
    ).toBeDefined();
  });

  it("can retry CCR when the runtime status is an error", async () => {
    const provider = providerFixture();
    provider.ccrStatus = {
      enabled: true,
      phase: "error",
      baseUrl: "http://127.0.0.1:3456",
      routeCount: 1,
      routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
      lastError: "ccr_port_still_open",
    };
    const { invalidateQueries } = renderModelSection(provider);

    expect(
      await screen.findByText("CCR failed to start: ccr_port_still_open"),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(applyCcrRuntimeRoutesMock).toHaveBeenCalled());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["provider"] });
  });

  it("updates the visible CCR error when retry returns a newer failed status", async () => {
    const provider = providerFixture();
    provider.ccrStatus = {
      enabled: true,
      phase: "error",
      baseUrl: "http://127.0.0.1:3456",
      routeCount: 1,
      routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
      lastError: "ccr_port_still_open",
    };
    applyCcrRuntimeRoutesMock.mockImplementationOnce(async () => {
      const status = {
        enabled: true,
        phase: "error" as const,
        baseUrl: "http://127.0.0.1:3456",
        routeCount: 1,
        routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
        lastError: "ccr_not_ready:timeout",
      };
      throw new CcrRuntimeApplyErrorMock("ccr_not_ready:timeout", status);
    });

    renderModelSection(provider);

    expect(
      await screen.findByText("CCR failed to start: ccr_port_still_open"),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("CCR failed to start: ccr_not_ready:timeout"),
    ).toBeDefined();
  });

  it("polls provider settings while CCR routes are applying", async () => {
    let calls = 0;
    getProviderMock.mockImplementation(async () => {
      calls += 1;
      const next = providerFixture();
      next.ccrStatus =
        calls === 1
          ? {
              enabled: true,
              phase: "applying",
              baseUrl: "http://127.0.0.1:3456",
              routeCount: 1,
              routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
            }
          : {
              enabled: true,
              phase: "ready",
              baseUrl: "http://127.0.0.1:3456",
              routeCount: 1,
              routeKeys: ["agentstudio/conn-openai/gpt-5.1"],
            };
      providerState = next;
      return next;
    });

    renderModelSection(providerFixture());

    expect(
      await screen.findByText(
        "Applying model routes. OpenAI-compatible conversations are temporarily unavailable.",
      ),
    ).toBeDefined();
    await waitFor(() => expect(calls).toBeGreaterThan(1), { timeout: 2_500 });
    expect(await screen.findByText("CCR ready, 1 model routes applied")).toBeDefined();
  });

  it("opens the add model dialog", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));

    expect(screen.getByText("Add model provider")).toBeDefined();
    expect(screen.getByLabelText("Connection name")).toBeDefined();
    expect((screen.getByLabelText("Connection name") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("keeps the provider dialog within the viewport and scrolls the form body", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));

    const dialog = screen.getByTestId("dialog-content");
    expect(dialog.getAttribute("data-class-name")).toContain(
      "max-h-[calc(100dvh-2rem)]",
    );
    expect(dialog.getAttribute("data-class-name")).toContain("overflow-hidden");
    expect(screen.getByTestId("provider-dialog-body").className).toContain(
      "overflow-y-auto",
    );
  });

  it("opens edit with provider details", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByRole("button", { name: "Edit OpenAI" }));

    await waitFor(() =>
      expect(getProviderConnectionMock).toHaveBeenCalledWith("conn-openai"),
    );
    expect(screen.getByText("Edit model provider")).toBeDefined();
    expect(screen.getByDisplayValue("OpenAI")).toBeDefined();
  });

  it("opens the provider dropdown below the trigger with a compact height", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));

    const providerContent = screen.getAllByTestId("select-content")[0]!;
    expect(providerContent.getAttribute("data-position")).toBe("popper");
    expect(providerContent.getAttribute("data-side")).toBe("bottom");
    expect(providerContent.getAttribute("data-align")).toBe("start");
    expect(providerContent.getAttribute("data-avoid-collisions")).toBe("false");
    expect(providerContent.getAttribute("data-class-name")).toContain("max-h-56");
  });

  it("renders built-in providers as a flat list with Chinese provider names", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));

    const providerContent = screen.getAllByTestId("select-content")[0]!;
    expect(providerContent.textContent).toContain("OpenAI");
    expect(providerContent.textContent).toContain("硅基流动（中国）");
    expect(providerContent.textContent).not.toContain("国内模型");
    expect(providerContent.textContent).not.toContain("国外模型");
  });

  it("fills the connection name from the selected provider", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));
    const connectionName = screen.getByLabelText("Connection name");
    const providerActions = screen.getAllByTestId("select-actions")[0]!;
    const providerButtons = providerActions.querySelectorAll("button");

    expect((connectionName as HTMLInputElement).value).toBe("");

    fireEvent.click(providerButtons[0]!);
    expect((connectionName as HTMLInputElement).value).toBe("OpenAI");

    fireEvent.click(providerButtons[1]!);
    expect((connectionName as HTMLInputElement).value).toBe("硅基流动（中国）");
  });

  it("refreshes models for a non-default provider connection", async () => {
    const { invalidateQueries } = renderModelSection(providerFixture());

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit SiliconFlow" }),
    );
    fireEvent.click(await screen.findByText("Refresh models"));

    await waitFor(() =>
      expect(refreshProviderConnectionModelsMock).toHaveBeenCalledWith(
        "conn-sf",
      ),
    );
    expect(updateProviderConnectionMock).toHaveBeenCalledWith(
      "conn-sf",
      expect.objectContaining({
        providerName: "SiliconFlow",
        profileId: "siliconflow-cn",
      }),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["provider"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["models"] });
  });

  it("sets a provider connection as the default provider", async () => {
    const { invalidateQueries } = renderModelSection(providerFixture());

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Set default SiliconFlow",
      }),
    );

    await waitFor(() =>
      expect(setDefaultProviderSelectionMock).toHaveBeenCalledWith({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );
    expect(setProviderConnectionEnabledModelsMock).toHaveBeenCalledWith(
      "conn-sf",
      {
        modelIds: ["deepseek-ai/DeepSeek-V3.2"],
        defaultModelId: "deepseek-ai/DeepSeek-V3.2",
      },
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["provider"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["models"] });
  });

  it("creates then refreshes models from the add provider dialog", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));
    fireEvent.change(screen.getByLabelText("Connection name"), {
      target: { value: "Anthropic Fresh" },
    });
    fireEvent.click(screen.getByText("Refresh models"));

    await waitFor(() =>
      expect(createProviderConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Anthropic Fresh",
          profileId: "openai",
        }),
      ),
    );
    expect(refreshProviderConnectionModelsMock).toHaveBeenCalledWith(
      "conn-openai",
    );
  });

  it("allows refreshing models when adding an Anthropic connection", async () => {
    renderModelSection(providerFixtureWithAnthropicFirst());

    fireEvent.click(await screen.findByText("Add model"));

    expect((screen.getByText("Refresh models") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("saves a custom Anthropic-compatible provider connection", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));
    const providerActions = screen.getAllByTestId("select-actions")[0]!;
    fireEvent.click(providerActions.querySelectorAll("button")[2]!);
    fireEvent.change(screen.getByLabelText("Connection name"), {
      target: { value: "Custom Anthropic" },
    });
    const protocolActions = screen.getAllByTestId("select-actions")[1]!;
    fireEvent.click(protocolActions.querySelectorAll("button")[2]!);
    fireEvent.change(screen.getByPlaceholderText("https://api.example.com"), {
      target: { value: "https://gateway.example" },
    });
    fireEvent.change(screen.getByPlaceholderText("sk-ant-..."), {
      target: { value: "gateway-key" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(createProviderConnectionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Custom Anthropic",
          profileId: "custom",
          customProtocol: "anthropic",
          baseUrl: "https://gateway.example",
          apiKey: "gateway-key",
        }),
      ),
    );
  });

  it("saves multiple enabled models", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByRole("button", { name: "Edit OpenAI" }));
    fireEvent.click(await screen.findByLabelText("GPT-5.1 Mini"));
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(setProviderConnectionEnabledModelsMock).toHaveBeenCalledWith(
        "conn-openai",
        {
          modelIds: ["gpt-5.1", "gpt-5.1-mini"],
          defaultModelId: "gpt-5.1",
        },
      ),
    );
  });

  it("saves an explicit default model inside the provider dialog", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByRole("button", { name: "Edit OpenAI" }));
    fireEvent.click(await screen.findByLabelText("GPT-5.1 Mini"));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Set default GPT-5.1 Mini",
      }),
    );
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(setProviderConnectionEnabledModelsMock).toHaveBeenCalledWith(
        "conn-openai",
        {
          modelIds: ["gpt-5.1", "gpt-5.1-mini"],
          defaultModelId: "gpt-5.1-mini",
        },
      ),
    );
  });

  it("keeps wheel scrolling inside the model list", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByRole("button", { name: "Edit OpenAI" }));
    const modelList = await screen.findByTestId("provider-model-list");
    const EventCtor = modelList.ownerDocument.defaultView!.Event;
    const event = new EventCtor("wheel", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "deltaY", { value: 80 });
    modelList.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
