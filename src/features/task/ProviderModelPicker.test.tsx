import { afterEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ProviderModelSelection } from "@/lib/data/settings";
import { ProviderModelPicker } from "./ProviderModelPicker";

const onChangeMock = mock(() => {});
const setDefaultProviderSelectionMock = mock(async () => providerState);

let providerState = {
  version: 3 as const,
  defaultSelection: { providerId: "conn-openai", modelId: "gpt-5.1" },
  current: { presetId: "conn-openai", presetName: "OpenAI" },
  activePresetId: "conn-openai",
  builtIn: [],
  presets: [],
  connections: [],
  enabledModels: [
    {
      providerId: "conn-openai",
      providerName: "OpenAI",
      providerLabel: "OpenAI",
      modelId: "gpt-5.1",
      modelLabel: "GPT-5.1",
      modelDescription: "Flagship model",
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    },
    {
      providerId: "conn-openai",
      providerName: "OpenAI",
      providerLabel: "OpenAI",
      modelId: "gpt-5.1-mini",
      modelLabel: "GPT-5.1 Mini",
      modelDescription: "Fast model",
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    },
    {
      providerId: "conn-sf",
      providerName: "SiliconFlow",
      providerLabel: "SiliconFlow",
      modelId: "deepseek-ai/DeepSeek-V3.2",
      modelLabel: "DeepSeek V3.2",
      modelDescription: "Remote model",
      agentRuntime: {
        protocol: "openai-compatible",
        baseUrl: "https://api.siliconflow.cn/v1",
        auth: "bearer",
        capabilities: { text: true, tools: false, fileCheckpoint: false },
      },
    },
  ],
};

const initialProviderState = providerState;

mock.module("@/lib/data/settings", () => ({
  getProvider: mock(async () => providerState),
  setDefaultProviderSelection: setDefaultProviderSelectionMock,
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "task.modelPicker.configureModels": "配置模型",
        "task.modelPicker.enableModels": "请在设置中启用模型。",
        "task.modelPicker.official": "官方",
        "task.modelPicker.selected": "已选择",
      })[key] ?? key,
  }),
}));

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  providerState = initialProviderState;
  onChangeMock.mockClear();
  setDefaultProviderSelectionMock.mockClear();
});

function renderPicker(
  disabled = false,
  value: ProviderModelSelection | null = {
    providerId: "conn-openai",
    modelId: "gpt-5.1",
  },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ProviderModelPicker
          disabled={disabled}
          value={value}
          onChange={onChangeMock}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("ProviderModelPicker", () => {
  it("groups enabled models by provider", async () => {
    renderPicker();

    expect(await screen.findByText("OpenAI")).toBeDefined();
    expect(screen.getByText("SiliconFlow")).toBeDefined();
    expect(screen.getAllByText("GPT-5.1").length).toBeGreaterThan(0);
    expect(screen.getByText("DeepSeek V3.2")).toBeDefined();
  });

  it("only shows a localized green selected label instead of model descriptions", async () => {
    providerState = {
      ...providerState,
      defaultSelection: { providerId: "official", modelId: "gpt-5.1" },
      enabledModels: [
        {
          providerId: "official",
          providerName: "官方服务商",
          providerLabel: "官方服务商",
          managed: true,
          modelId: "gpt-5.1",
          modelLabel: "GPT-5.1",
          modelDescription: "Official model",
          agentRuntime: {
            protocol: "openai-compatible",
            baseUrl: "",
            auth: "bearer",
            capabilities: { text: true, tools: false, fileCheckpoint: false },
          },
        },
        {
          providerId: "conn-sf",
          providerName: "硅基流动",
          providerLabel: "硅基流动",
          modelId: "deepseek-ai/DeepSeek-V3",
          modelLabel: "deepseek-ai/DeepSeek-V3",
          modelDescription: "Remote model",
          agentRuntime: {
            protocol: "openai-compatible",
            baseUrl: "https://api.siliconflow.cn/v1",
            auth: "bearer",
            capabilities: { text: true, tools: false, fileCheckpoint: false },
          },
        },
      ],
    };

    renderPicker(false, { providerId: "official", modelId: "gpt-5.1" });

    const selectedLabel = await screen.findByText("已选择");
    expect(selectedLabel.className).toContain("text-[hsl(var(--success-100))]");
    expect(screen.queryByText("Selected")).toBeNull();
    expect(screen.queryByText("Official model")).toBeNull();
    expect(screen.queryByText("Remote model")).toBeNull();
  });

  it("selects a concrete provider and model", async () => {
    renderPicker();

    fireEvent.click(await screen.findByText("DeepSeek V3.2"));

    await waitFor(() =>
      expect(onChangeMock).toHaveBeenCalledWith({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );
  });

  it("persists the selected provider model as the next default", async () => {
    renderPicker();

    fireEvent.click(await screen.findByText("DeepSeek V3.2"));

    await waitFor(() =>
      expect(setDefaultProviderSelectionMock).toHaveBeenCalledWith({
        providerId: "conn-sf",
        modelId: "deepseek-ai/DeepSeek-V3.2",
      }),
    );
  });

  it("disables selection while a run is active", async () => {
    renderPicker(true);

    const button = await screen.findByRole("button", { name: /GPT-5.1/ });
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("marks managed official provider groups", async () => {
    providerState = {
      ...providerState,
      defaultSelection: { providerId: "official", modelId: "gpt-5.1" },
      enabledModels: [
        {
          providerId: "official",
          providerName: "官方服务商",
          providerLabel: "官方服务商",
          managed: true,
          modelId: "gpt-5.1",
          modelLabel: "GPT-5.1",
          modelDescription: "Official model",
          agentRuntime: {
            protocol: "openai-compatible",
            baseUrl: "",
            auth: "bearer",
            capabilities: { text: true, tools: false, fileCheckpoint: false },
          },
        },
        ...providerState.enabledModels,
      ],
    };

    renderPicker();

    expect(await screen.findByText("官方服务商")).toBeDefined();
    expect(screen.getByText("官方")).toBeDefined();
    expect(screen.queryByText("Official")).toBeNull();
  });

  it("shows an empty state when no models are configured", async () => {
    providerState = { ...providerState, defaultSelection: null, enabledModels: [] };

    renderPicker();

    expect(await screen.findByText("Configure models")).toBeDefined();
  });
});
