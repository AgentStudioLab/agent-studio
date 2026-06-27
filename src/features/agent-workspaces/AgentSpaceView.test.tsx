import { afterEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AgentWorkspace } from "@/lib/data/types";

const navigate = mock((_path: string | number) => {});
const invalidateQueries = mock((_args: unknown) => {});
const setPendingFirstPrompt = mock((_args: unknown) => {});
const createScheduledTaskMutate = mock(
  (_args: unknown, _options?: { onSuccess?: () => void; onError?: () => void }) => {},
);
const createConversationMock = mock(async () => ({ id: "thread-1" }));

const baseAgent: AgentWorkspace = {
  id: "coder",
  name: "代码助手",
  avatar: null,
  homeDir: "/tmp/coder",
  archived: false,
  pinned: false,
  mountedSkills: null,
  source: "user",
  category: "development",
  coverImage: "development",
  catalogMetadata: null,
  createdAt: 1,
  updatedAt: 1,
};
let currentAgent = baseAgent;

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentSpace.back": "返回",
        "agentSpace.promptPlaceholder": "在这个智能体空间里开始一个对话…",
        "agentSpace.pack.title": "能力概览",
        "agentSpace.pack.inputs": "适合输入",
        "agentSpace.pack.outputs": "预计产出",
        "agentSpace.pack.tools": "可选工具",
        "agentSpace.pack.risks": "权限与风险",
        "agentSpace.pack.sampleTasks": "示例任务",
        "agentSpace.dailyBriefing.title": "每日简报设置",
        "agentSpace.dailyBriefing.description": "配置固定信息源，生成可录制的短音频简报。",
        "agentSpace.dailyBriefing.sourcesLabel": "信息源",
        "agentSpace.dailyBriefing.sourcesPlaceholder": "每行一个 RSS、网页或文件夹说明",
        "agentSpace.dailyBriefing.topicLabel": "关注主题",
        "agentSpace.dailyBriefing.topicPlaceholder": "例如：AI 产品发布、融资、政策变化",
        "agentSpace.dailyBriefing.audienceLabel": "听众",
        "agentSpace.dailyBriefing.durationLabel": "时长",
        "agentSpace.dailyBriefing.durationFive": "5 分钟",
        "agentSpace.dailyBriefing.languageLabel": "语言",
        "agentSpace.dailyBriefing.languageChinese": "中文",
        "agentSpace.dailyBriefing.scheduleLabel": "频率",
        "agentSpace.dailyBriefing.scheduleDaily": "每天",
        "agentSpace.dailyBriefing.timeLabel": "时间",
        "agentSpace.dailyBriefing.runNow": "生成今日简报",
        "agentSpace.dailyBriefing.createSchedule": "创建定时简报",
        "agentSpace.dailyBriefing.sourcesRequired": "先添加至少一个信息源。",
        "agentSpace.dailyBriefing.created": "定时简报已创建，可在右侧定时任务或计划任务页查看。",
        "agentSpace.dailyBriefing.runFailed": "生成今日简报失败，请确认本地服务已启动后重试。",
        "agentSpace.dailyBriefing.scheduleFailed": "创建定时简报失败，请稍后重试。",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("react-router-dom", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ agentId: currentAgent.id }),
}));

mock.module("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

mock.module("@/app/AppShell", () => ({
  AppShell: ({ main }: { main: ReactNode }) => <>{main}</>,
}));

mock.module("@/shared/layout/PageColumn", () => ({
  PageColumn: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

mock.module("@/app/AppShellContext", () => ({
  useAppShell: () => ({ setPendingFirstPrompt }),
}));

mock.module("@/lib/data/agent-queries", () => ({
  useAgentWorkspaces: () => ({ data: [currentAgent] }),
  useAgentWorkspace: () => ({ data: currentAgent }),
  useCreateAgentWorkspaceMutation: () => ({ mutate: mock(() => {}) }),
  useUpdateAgentWorkspaceMutation: () => ({ mutate: mock(() => {}) }),
  useCloneAgentWorkspaceMutation: () => ({ mutate: mock(() => {}) }),
}));

mock.module("@/lib/data/conversations", () => ({
  createConversation: createConversationMock,
}));

mock.module("@/lib/data/scheduled-queries", () => ({
  useCreateScheduledTaskMutation: () => ({ mutate: createScheduledTaskMutate }),
}));

mock.module("@/lib/data/queries", () => ({
  queryKeys: { recents: ["recents"] },
}));

mock.module("@/lib/agui/react/useChat", () => ({
  threadStatusKey: ["thread-status"],
}));

mock.module("@/lib/data/agent-memory-tree-queries", () => ({
  agentMemoryKeys: { tree: (agentId: string) => ["agent-memory-tree", agentId] },
}));

mock.module("@/lib/models", () => ({
  useAvailableModels: () => ({ defaultModelId: "claude-sonnet" }),
}));

mock.module("@/components/ai-elements/prompt-input", () => ({
  PromptInput: ({ children }: { children: ReactNode }) => <form>{children}</form>,
  PromptInputFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PromptInputSubmit: () => <button type="submit">submit</button>,
  PromptInputTools: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

mock.module("@/features/composer/SlashEditor", () => ({
  SlashEditor: ({ placeholder, value }: { placeholder: string; value?: string }) => (
    <textarea aria-label={placeholder} value={value ?? ""} readOnly />
  ),
}));

mock.module("@/features/task/ModelPicker", () => ({
  ModelPicker: () => <button type="button">model</button>,
}));

mock.module("@/features/agent-workspaces/AgentSpaceHeader", () => ({
  AgentSpaceHeader: ({ agent }: { agent: AgentWorkspace }) => <h1>{agent.name}</h1>,
}));

mock.module("@/features/agent-workspaces/AgentRecents", () => ({
  AgentRecents: () => <section>recents</section>,
}));

mock.module("@/features/agent-workspaces/InstructionsCard", () => ({
  InstructionsCard: () => <section>instructions</section>,
}));

mock.module("@/features/agent-workspaces/ScheduledRailCard", () => ({
  ScheduledRailCard: () => <section>scheduled</section>,
}));

mock.module("@/features/agent-workspaces/SkillsRailCard", () => ({
  SkillsRailCard: () => <section>skills</section>,
}));

mock.module("@/features/agent-workspaces/ContextCard", () => ({
  ContextCard: () => <section>context</section>,
}));

mock.module("@/features/task/PreviewPane", () => ({
  PreviewPane: () => <section>preview</section>,
}));

const { AgentSpaceView } = require("./AgentSpaceView") as typeof import("./AgentSpaceView");

afterEach(() => {
  cleanup();
  currentAgent = baseAgent;
  navigate.mockClear();
  invalidateQueries.mockClear();
  setPendingFirstPrompt.mockClear();
  createScheduledTaskMutate.mockClear();
  createConversationMock.mockClear();
});

describe("AgentSpaceView", () => {
  it("shows a compact draggable top-row back button that follows browser history", () => {
    render(<AgentSpaceView />);

    const backButton = screen.getByRole("button", { name: "返回" });
    const dragRegion = backButton.closest("[data-tauri-drag-region]");

    expect(dragRegion).not.toBeNull();
    expect(dragRegion?.className).toContain("pt-2");

    fireEvent.click(backButton);

    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("prefills the composer from a podcast pack sample task", () => {
    currentAgent = {
      ...baseAgent,
      id: "podcast-research-producer",
      name: "资料播客制作人",
      source: "builtin",
      category: "podcast",
      coverImage: "podcast",
      catalogMetadata: {
        domain: "audio",
        scenario: "podcast-production",
        tagline: "把资料变成可录制的一期播客",
        inputTypes: ["PDF", "链接"],
        outputTypes: ["script", "shownotes"],
        optionalTools: ["ffmpeg"],
        riskTags: ["copyright"],
        sampleTasks: [
          {
            title: "资料生成双人播客脚本",
            prompt: "请生成一期 20 分钟双人对谈播客脚本。",
          },
        ],
      },
    };

    render(<AgentSpaceView />);

    fireEvent.click(screen.getByRole("button", { name: "资料生成双人播客脚本" }));

    expect(
      screen.getByDisplayValue("请生成一期 20 分钟双人对谈播客脚本。"),
    ).toBeTruthy();
  });

  it("runs and schedules a daily audio briefing from a dedicated setup panel", async () => {
    currentAgent = {
      ...baseAgent,
      id: "podcast-daily-briefing",
      name: "每日音频简报助手",
      source: "builtin",
      category: "podcast",
      coverImage: "podcast",
      catalogMetadata: {
        domain: "audio",
        scenario: "podcast-daily-briefing",
        tagline: "把固定信息源整理成每日可录制简报",
        inputTypes: ["rss", "url"],
        outputTypes: ["briefing-script", "sources"],
        optionalTools: ["rsshub"],
        riskTags: ["web-access"],
        sampleTasks: [],
      },
    };

    render(<AgentSpaceView />);

    expect(screen.getByText("每日简报设置")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("信息源"), {
      target: {
        value: "https://news.example/rss\nhttps://example.com/report",
      },
    });
    fireEvent.change(screen.getByLabelText("关注主题"), {
      target: { value: "AI 产品发布、融资、政策变化" },
    });

    fireEvent.click(screen.getByRole("button", { name: "生成今日简报" }));

    await waitFor(() => expect(setPendingFirstPrompt).toHaveBeenCalled());
    const runPrompt = (setPendingFirstPrompt.mock.calls[0]?.[0] as { text: string }).text;
    expect(runPrompt).toContain("https://news.example/rss");
    expect(runPrompt).toContain("AI 产品发布、融资、政策变化");
    expect(runPrompt).toContain("daily-briefing-script.md");
    expect(navigate).toHaveBeenCalledWith("/task/thread-1");

    fireEvent.click(screen.getByRole("button", { name: "创建定时简报" }));

    expect(createScheduledTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        agentWorkspaceId: "podcast-daily-briefing",
        frequency: "daily",
        permissionMode: "act-without-asking",
        allowedTools: ["WebFetch", "WebSearch"],
        prompt: expect.stringContaining("https://example.com/report"),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(
      screen.queryByText("定时简报已创建，可在右侧定时任务或计划任务页查看。"),
    ).toBeNull();

    const createOptions = createScheduledTaskMutate.mock.calls[0]?.[1] as
      | { onSuccess?: () => void }
      | undefined;
    act(() => {
      createOptions?.onSuccess?.();
    });

    expect(
      screen.getByText("定时简报已创建，可在右侧定时任务或计划任务页查看。"),
    ).toBeTruthy();
  });

  it("shows visible errors when daily briefing actions fail", async () => {
    currentAgent = {
      ...baseAgent,
      id: "podcast-daily-briefing",
      name: "每日音频简报助手",
      source: "builtin",
      category: "podcast",
      coverImage: "podcast",
      catalogMetadata: {
        domain: "audio",
        scenario: "podcast-daily-briefing",
        tagline: "把固定信息源整理成每日可录制简报",
        inputTypes: ["rss", "url"],
        outputTypes: ["briefing-script", "sources"],
        optionalTools: ["rsshub"],
        riskTags: ["web-access"],
        sampleTasks: [],
      },
    };
    createConversationMock.mockImplementationOnce(async () => {
      throw new Error("sidecar_unavailable");
    });

    render(<AgentSpaceView />);

    fireEvent.change(screen.getByLabelText("信息源"), {
      target: { value: "https://news.example/rss" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成今日简报" }));

    expect(
      await screen.findByText("生成今日简报失败，请确认本地服务已启动后重试。"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "创建定时简报" }));
    const createOptions = createScheduledTaskMutate.mock.calls[0]?.[1] as
      | { onError?: () => void }
      | undefined;
    act(() => {
      createOptions?.onError?.();
    });

    expect(screen.getByText("创建定时简报失败，请稍后重试。")).toBeTruthy();
  });
});
