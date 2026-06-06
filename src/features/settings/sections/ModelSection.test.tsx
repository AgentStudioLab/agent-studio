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
  connection: providerConnections[id],
}));

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
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
            enabledModels: "Enabled models",
            disabled: "Disabled",
            missingApiKey: "Missing key",
            connectionAddTitle: "Add model provider",
            connectionEditTitle: "Edit model provider",
            connectionDialogDescription: "Configure endpoint",
            connectionNameLabel: "Connection name",
            profileLabel: "Provider",
            profile: { custom: "Custom (OpenAI-compatible)" },
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
        providerLabel: "SiliconFlow China",
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
        label: "SiliconFlow China",
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

function connectionFixture(id: string): ProviderConnectionConfig {
  const provider = providerFixture();
  const summary = provider.connections?.find((entry) => entry.id === id);
  if (!summary) throw new Error("missing fixture");
  const builtIn = provider.builtIn.find((entry) => entry.id === summary.profileId);
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

  it("opens the add model dialog", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Add model"));

    expect(screen.getByText("Add model provider")).toBeDefined();
    expect(screen.getByLabelText("Connection name")).toBeDefined();
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

  it("does not render a default model selector in the provider dialog", async () => {
    renderModelSection(providerFixture());

    fireEvent.click(await screen.findByRole("button", { name: "Edit OpenAI" }));

    await waitFor(() =>
      expect(getProviderConnectionMock).toHaveBeenCalledWith("conn-openai"),
    );
    expect(screen.queryByRole("button", { name: "Default model" })).toBeNull();
    expect(screen.queryByText("Default model")).toBeNull();
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
