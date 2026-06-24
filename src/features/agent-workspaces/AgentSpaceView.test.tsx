import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AgentWorkspace } from "@/lib/data/types";

const navigate = mock((_path: string | number) => {});
const invalidateQueries = mock((_args: unknown) => {});
const setPendingFirstPrompt = mock((_args: unknown) => {});

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
  createConversation: mock(async () => ({ id: "thread-1" })),
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
});
