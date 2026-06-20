import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
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
        "agents.categories.development": "开发构建",
        "agents.categories.research": "研究分析",
        "agents.categories.writing": "内容写作",
        "agents.categories.automation": "自动化执行",
        "agents.categories.general": "通用助手",
        "agents.categoryDescriptions.development": "代码实现、重构、调试与交付",
        "agents.categoryDescriptions.research": "资料搜集、分析归纳与判断",
        "agents.categoryDescriptions.writing": "内容规划、写作与润色",
        "agents.categoryDescriptions.automation": "重复任务、流程编排与运维",
        "agents.categoryDescriptions.general": "日常任务与开放式协作",
      };
      return translations[key] ?? key;
    },
  }),
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

const { NewAgentModal } = require("./NewAgentModal") as typeof import("./NewAgentModal");

afterEach(() => {
  cleanup();
});

describe("NewAgentModal", () => {
  it("saves the selected writing category instead of falling back to general", () => {
    const onSave = mock(() => {});

    render(<NewAgentModal open onOpenChange={() => {}} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("名称 *"), {
      target: { value: "周更博客助手" },
    });
    fireEvent.change(screen.getByLabelText("系统提示词"), {
      target: { value: "  你是一个内容写作助手。  " },
    });
    fireEvent.click(
      screen.getByRole("radio", {
        name: "内容写作 内容规划、写作与润色",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "周更博客助手",
      avatar: null,
      category: "writing",
      coverImage: "writing",
      instructions: "你是一个内容写作助手。",
    });
  });
});
