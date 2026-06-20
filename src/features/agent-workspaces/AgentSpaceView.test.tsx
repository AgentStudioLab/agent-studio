import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AgentWorkspace } from "@/lib/data/types";

const navigate = mock((_path: string | number) => {});
const invalidateQueries = mock((_args: unknown) => {});
const setPendingFirstPrompt = mock((_args: unknown) => {});

const agent: AgentWorkspace = {
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
  createdAt: 1,
  updatedAt: 1,
};

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentSpace.back": "返回",
        "agentSpace.promptPlaceholder": "在这个智能体空间里开始一个对话…",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("react-router-dom", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ agentId: agent.id }),
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
  useAgentWorkspace: () => ({ data: agent }),
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
  SlashEditor: ({ placeholder }: { placeholder: string }) => (
    <textarea aria-label={placeholder} />
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
});
