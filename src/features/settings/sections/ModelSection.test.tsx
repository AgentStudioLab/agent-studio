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
import type { ProviderState } from "@/lib/data/settings";

notifyManager.setScheduler(queueMicrotask);

const getProviderMock = mock(async () => providerState);
const setProviderMock = mock(async (patch: unknown) => ({
  ...providerState.current,
  ...(patch as object),
}));
const refreshModelsMock = mock(async () => modelsState);

let providerState: ProviderState;
let modelsState = {
  data: [
    {
      id: "openrouter/auto",
      displayName: "OpenRouter Auto",
      description: "Auto-routed model",
    },
  ],
  defaultModelId: "openrouter/auto",
};

mock.module("@/lib/data/settings", () => ({
  getProvider: getProviderMock,
  setProvider: setProviderMock,
}));

mock.module("@/lib/models", () => ({
  refreshModels: refreshModelsMock,
  useAvailableModels: () => ({
    models: modelsState.data,
    defaultModelId: modelsState.defaultModelId,
    isLoading: false,
    isError: false,
  }),
}));

mock.module("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: ReactNode;
  }) => (
    <div data-select-value={value}>
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
          apiKey: {
            placeholder: "sk-ant-...",
          },
          provider: {
            title: "Model Provider",
            description: "Pick an endpoint",
            profileLabel: "Provider",
            profile: {
              custom: "Custom (OpenAI-compatible)",
            },
            baseUrlLabel: "Base URL",
            baseUrlPlaceholder: "https://api.example.com",
            baseUrlHint: "Leave empty to use the selected provider's default.",
            apiKeyLabel: "API Key",
            showApiKey: "Show API key",
            hideApiKey: "Hide API key",
            save: "Save",
            saved: "Saved",
            saveError: "Save failed",
            modelLabel: "Model",
            modelPlaceholder: "Select a model",
            refreshModels: "Refresh models",
            refreshingModels: "Refreshing...",
            refreshSuccess: "Model list refreshed",
            refreshUnsupported:
              "This provider does not support remote model refresh",
            refreshMissingKey: "Enter an API key first",
            refreshError: "Model refresh failed",
            lastRefreshed: "Last refreshed: {{time}}",
            compatibilityNote: "Compatibility note",
            runtimeLabel: "Agent runtime",
            runtimeAnthropic: "Anthropic-compatible",
            runtimeOpenAI: "OpenAI-compatible",
            runtimeTextOnly:
              "Text streaming is available; tool calls and file rewind are not connected yet.",
            runtimeUnsupported: "Agent runtime not implemented",
            runtimeBaseUrl: "Runtime Base URL: {{baseUrl}}",
          },
        },
      },
    },
  },
});

function renderModelSection(provider: ProviderState) {
  providerState = provider;
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

function providerFixture(
  overrides: Partial<ProviderState["current"]> = {},
): ProviderState {
  return {
    current: {
      profileId: "openrouter",
      label: "OpenRouter Catalog",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      models: modelsState.data,
      remoteModelsFetchedAt: "2026-05-29T08:00:00.000Z",
      selectedModelId: "openrouter/auto",
      supportsRemoteModels: true,
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
      ...overrides,
    },
    builtIn: [
      {
        id: "openrouter",
        label: "OpenRouter Catalog",
        baseUrl: "https://openrouter.ai/api/v1",
        supportsRemoteModels: true,
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://openrouter.ai/api/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
        models: modelsState.data,
      },
      {
        id: "gemini",
        label: "Gemini Live",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        supportsRemoteModels: true,
        agentRuntime: {
          protocol: "unsupported",
          reason: "Agent runtime is not implemented for this provider.",
          capabilities: { text: false, tools: false, fileCheckpoint: false },
        },
        compatibilityNote: "Requires OpenAI-compatible mode.",
        models: [
          {
            id: "gemini-2.5-flash",
            displayName: "Gemini Flash",
            description: "Gemini model",
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  getProviderMock.mockClear();
  setProviderMock.mockClear();
  refreshModelsMock.mockClear();
});

import { ModelSection } from "./ModelSection";

describe("ModelSection", () => {
  it("renders provider options from the backend built-in catalog", async () => {
    renderModelSection(providerFixture());

    await waitFor(() =>
      expect(screen.getAllByText("OpenRouter Catalog").length).toBeGreaterThan(
        0,
      ),
    );
    expect(screen.getAllByText("Gemini Live").length).toBeGreaterThan(0);
    expect(screen.queryByText("DeepSeek")).toBeNull();
  });

  it("opens the provider list from a fixed downward placement", async () => {
    renderModelSection(providerFixture());

    await screen.findByRole("button", { name: "Provider" });
    const contents = screen.getAllByTestId("select-content");

    expect(contents[0]?.getAttribute("data-position")).toBe("popper");
    expect(contents[0]?.getAttribute("data-side")).toBe("bottom");
    expect(contents[0]?.getAttribute("data-align")).toBe("start");
    expect(contents[0]?.getAttribute("data-avoid-collisions")).toBe("false");
    expect(contents[0]?.getAttribute("data-class-name")).toContain("!h-auto");
  });

  it("switches to an unsaved provider model list and saves its fallback model", async () => {
    renderModelSection(providerFixture());

    await waitFor(() =>
      expect(screen.getAllByText("Gemini Live").length).toBeGreaterThan(0),
    );
    const geminiAction = screen
      .getAllByText("Gemini Live")
      .find((el) => el.tagName === "BUTTON");
    expect(geminiAction).toBeDefined();
    fireEvent.click(geminiAction!);

    await waitFor(() =>
      expect(screen.getAllByText("Gemini Flash").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("OpenRouter Auto")).toBeNull();

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(setProviderMock).toHaveBeenCalledTimes(1));
    expect(setProviderMock.mock.calls[0]?.[0]).toMatchObject({
      profileId: "gemini",
      selectedModelId: "gemini-2.5-flash",
    });
  });

  it("labels select triggers for assistive technology", async () => {
    renderModelSection(
      providerFixture({
        profileId: "custom",
        label: "Custom",
        selectedModelId: null,
      }),
    );

    expect(
      await screen.findByRole("button", { name: "Provider" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Model" })).toBeDefined();
    expect(screen.queryByText("Model source")).toBeNull();
  });

  it("toggles API key visibility", async () => {
    renderModelSection(providerFixture());

    const input = await screen.findByPlaceholderText("sk-ant-...");
    expect(input.getAttribute("type")).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show API key" }));
    expect(input.getAttribute("type")).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide API key" }));
    expect(input.getAttribute("type")).toBe("password");
  });

  it("shows OpenAI-compatible runtime limitations for SiliconFlow", async () => {
    renderModelSection(
      providerFixture({
        profileId: "siliconflow-cn",
        label: "SiliconFlow China",
        baseUrl: "https://api.siliconflow.cn/v1",
        apiKey: "sf-key",
        models: [
          {
            id: "deepseek-ai/DeepSeek-V3.2",
            displayName: "DeepSeek V3.2",
            description: "Remote model",
          },
        ],
        remoteModelsFetchedAt: "2026-06-05T01:47:12.552Z",
        selectedModelId: "deepseek-ai/DeepSeek-V3.2",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.siliconflow.cn/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      }),
    );

    expect(await screen.findByText("Agent runtime")).toBeDefined();
    expect(screen.getByText("OpenAI-compatible")).toBeDefined();
    expect(screen.getByText(/Text streaming is available/)).toBeDefined();
  });

  it("shows OpenAI-compatible runtime limitations", async () => {
    renderModelSection(
      providerFixture({
        profileId: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "openai-key",
        models: [
          {
            id: "gpt-5.1",
            displayName: "GPT-5.1",
            description: "Remote model",
          },
        ],
        remoteModelsFetchedAt: "",
        selectedModelId: "gpt-5.1",
        agentRuntime: {
          protocol: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          auth: "bearer",
          capabilities: { text: true, tools: false, fileCheckpoint: false },
        },
      }),
    );

    expect(await screen.findByText("Agent runtime")).toBeDefined();
    expect(screen.getByText("OpenAI-compatible")).toBeDefined();
    expect(screen.getByText(/Text streaming is available/)).toBeDefined();
  });

  it("keeps the API key visibility toggle anchored while pressed", async () => {
    renderModelSection(providerFixture());

    const button = await screen.findByRole("button", {
      name: "Show API key",
    });

    expect(button.getAttribute("class")).toContain(
      "active:!-translate-y-1/2",
    );
  });

  it("refreshes models and invalidates provider and models queries", async () => {
    const { invalidateQueries } = renderModelSection(providerFixture());

    fireEvent.click(await screen.findByText("Refresh models"));

    await waitFor(() => expect(setProviderMock).toHaveBeenCalledTimes(1));
    expect(setProviderMock.mock.calls[0]?.[0]).toMatchObject({
      profileId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-test",
      selectedModelId: "openrouter/auto",
    });
    await waitFor(() => expect(refreshModelsMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText("Model list refreshed")).toBeDefined(),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["provider"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["models"] });
  });

  it("saves edited provider settings before refreshing models", async () => {
    renderModelSection(providerFixture());

    fireEvent.change(await screen.findByPlaceholderText("sk-ant-..."), {
      target: { value: "new-key" },
    });
    fireEvent.change(screen.getByPlaceholderText("https://api.example.com"), {
      target: { value: "https://edited.example/v1" },
    });
    fireEvent.click(screen.getByText("Refresh models"));

    await waitFor(() => expect(refreshModelsMock).toHaveBeenCalledTimes(1));
    expect(setProviderMock.mock.calls[0]?.[0]).toMatchObject({
      profileId: "openrouter",
      baseUrl: "https://edited.example/v1",
      apiKey: "new-key",
    });
  });

  it("shows missing API key feedback when refresh is rejected", async () => {
    refreshModelsMock.mockImplementationOnce(async () => {
      throw new Error("missing_api_key");
    });
    renderModelSection(providerFixture({ apiKey: "" }));

    fireEvent.click(await screen.findByText("Refresh models"));

    await waitFor(() =>
      expect(screen.getByText("Enter an API key first")).toBeDefined(),
    );
  });

  it("does not render manual custom model JSON controls", async () => {
    renderModelSection(
      providerFixture({
        profileId: "custom",
        label: "Custom",
        models: [],
        selectedModelId: null,
      }),
    );

    await screen.findByRole("button", { name: "Provider" });
    expect(screen.queryByText("Custom Model List (JSON)")).toBeNull();
    expect(screen.queryByPlaceholderText("[]")).toBeNull();
  });
});
