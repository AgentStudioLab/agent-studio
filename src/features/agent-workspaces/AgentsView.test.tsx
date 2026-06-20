import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AgentWorkspace } from "@/lib/data/types";

const navigate = mock((_path: string) => {});
const mutate = mock((_args: unknown) => {});

function agent(
  id: string,
  category: AgentWorkspace["category"],
  overrides: Partial<AgentWorkspace> = {},
): AgentWorkspace {
  return {
    id,
    name: id,
    avatar: null,
    homeDir: `/tmp/${id}`,
    archived: false,
    pinned: false,
    mountedSkills: null,
    source: "user",
    category,
    coverImage: category,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function defaultAgents(): AgentWorkspace[] {
  return [
    agent("researcher", "research"),
    agent("coder", "development"),
  ];
}

let currentAgents = defaultAgents();

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const translations: Record<string, string> = {
        "agents.title": "智能体空间",
        "agents.subtitle": "管理智能体",
        "agents.sort": "排序",
        "agents.search": "搜索",
        "agents.searchOpen": "搜索智能体",
        "agents.searchPlaceholder": "搜索名称、分类或描述",
        "agents.searchClear": "清空搜索",
        "agents.searchEmpty": "没有匹配的智能体。",
        "agents.newAgent": "新建智能体",
        "agents.empty": "暂无智能体",
        "agents.filteredEmpty": "当前分类暂无智能体",
        "agents.modal.title": "新建智能体",
        "agents.modal.editTitle": "编辑智能体",
        "agents.modal.name": "名称",
        "agents.modal.namePlaceholder": "例如：周更博客、Q3 市场研究",
        "agents.modal.instructions": "系统提示词",
        "agents.modal.instructionsDescription": "说明智能体的角色、工作方式和边界。",
        "agents.modal.instructionsPlaceholder": "例如：你是一个内容策划助手，擅长整理资料、生成大纲并保持语气简洁。",
        "agents.modal.category": "功能分类",
        "agents.modal.color": "颜色",
        "agents.modal.cancel": "取消",
        "agents.modal.save": "创建",
        "agents.modal.editSave": "保存",
        "agents.categories.all": "全部",
        "agents.categories.development": "开发构建",
        "agents.categories.research": "研究分析",
        "agents.categories.writing": "内容写作",
        "agents.categories.automation": "自动化执行",
        "agents.categories.general": "通用助手",
        "agents.categoryDescriptions.all": "全部智能体",
        "agents.categoryDescriptions.development": "代码实现、重构、调试与交付",
        "agents.categoryDescriptions.research": "资料搜集、分析归纳与判断",
        "agents.categoryDescriptions.writing": "内容规划、写作与润色",
        "agents.categoryDescriptions.automation": "重复任务、流程编排与运维",
        "agents.categoryDescriptions.general": "日常任务与开放式协作",
        "agents.updated": `更新于 ${values?.date ?? ""}`,
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

mock.module("@/app/AppShell", () => ({
  AppShell: ({ main }: { main: ReactNode }) => <>{main}</>,
}));

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

mock.module("@/shared/layout/PageColumn", () => ({
  PageColumn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module("@/lib/data/agent-queries", () => ({
  useAgentWorkspaces: () => ({
    data: currentAgents,
  }),
  useCreateAgentWorkspaceMutation: () => ({ mutate }),
}));

const { AgentsView } = require("./AgentsView") as typeof import("./AgentsView");

afterEach(() => {
  cleanup();
  currentAgents = defaultAgents();
  navigate.mockClear();
  mutate.mockClear();
});

describe("AgentsView", () => {
  it("preselects the active function tab when creating an agent", () => {
    render(<AgentsView />);

    fireEvent.click(screen.getByRole("tab", { name: "内容写作 0" }));
    fireEvent.click(screen.getByRole("button", { name: "新建智能体" }));

    expect(
      screen
        .getByRole("radio", { name: "内容写作 内容规划、写作与润色" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    fireEvent.change(screen.getByLabelText("名称 *"), {
      target: { value: "周更博客助手" },
    });
    fireEvent.change(screen.getByLabelText("系统提示词"), {
      target: { value: "只输出中文大纲。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(mutate).toHaveBeenCalledWith({
      name: "周更博客助手",
      avatar: null,
      category: "writing",
      coverImage: "writing",
      instructions: "只输出中文大纲。",
    });
  });

  it("filters agents by category description from the search input", () => {
    currentAgents = [
      agent("weekly-writer", "writing", { name: "周更博客" }),
      agent("code-helper", "development", { name: "代码助手" }),
      agent("daily-helper", "general", { name: "日常助理" }),
    ];

    render(<AgentsView />);

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索智能体" }), {
      target: { value: "重构" },
    });

    expect(screen.getByRole("button", { name: /代码助手/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /周更博客/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /日常助理/ })).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索智能体" }), {
      target: { value: "不存在的关键词" },
    });

    expect(screen.getByText("没有匹配的智能体。")).toBeTruthy();
  });

  it("toggles latest update sorting between newest first and oldest first", () => {
    currentAgents = [
      agent("older", "general", { name: "较早", updatedAt: 100 }),
      agent("newest", "general", { name: "最新", updatedAt: 300 }),
      agent("middle", "general", { name: "中间", updatedAt: 200 }),
    ];

    render(<AgentsView />);

    const visibleAgentNames = () =>
      screen
        .getAllByRole("button")
        .map((button) => button.textContent ?? "")
        .filter((text) => ["较早", "最新", "中间"].some((name) => text.includes(name)))
        .map((text) => ["较早", "最新", "中间"].find((name) => text.includes(name)));

    const sortButton = screen.getByRole("button", { name: "排序" });

    fireEvent.click(sortButton);
    expect(visibleAgentNames()).toEqual(["最新", "中间", "较早"]);
    expect(sortButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(sortButton);
    expect(visibleAgentNames()).toEqual(["较早", "中间", "最新"]);
    expect(sortButton.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(sortButton);
    expect(visibleAgentNames()).toEqual(["最新", "中间", "较早"]);
  });
});
