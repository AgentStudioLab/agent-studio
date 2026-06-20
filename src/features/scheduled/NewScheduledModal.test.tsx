import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

mock.module("@tauri-apps/plugin-dialog", () => ({
  open: mock(async () => null),
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "zh-CN" },
    t: (key: string) => {
      const translations: Record<string, string> = {
        "scheduled.modal.title": "新建计划任务",
        "scheduled.modal.editTitle": "编辑计划任务",
        "scheduled.modal.name": "名称",
        "scheduled.modal.namePlaceholder": "例如：日报整理",
        "scheduled.modal.description": "描述",
        "scheduled.modal.descriptionPlaceholder": "例如：每天整理项目状态",
        "scheduled.modal.promptPlaceholder": "告诉 agent 要做什么",
        "scheduled.modal.promptChips.workInProject": "在项目中工作",
        "scheduled.modal.promptChips.chooseFolder": "选择文件夹",
        "scheduled.modal.promptChips.defaultModel": "默认模型",
        "scheduled.modal.permissionMode.askShort": "询问",
        "scheduled.modal.permissionMode.actShort": "自动执行",
        "scheduled.modal.permissionMode.askTitle": "操作前询问",
        "scheduled.modal.permissionMode.askDesc": "执行工具前需要确认。",
        "scheduled.modal.permissionMode.actTitle": "无需询问",
        "scheduled.modal.permissionMode.actDesc": "自动执行允许的操作。",
        "scheduled.modal.permissionMode.confirmTitle": "确认自动执行",
        "scheduled.modal.permissionMode.confirmDesc": "agent 将无需逐次询问。",
        "scheduled.modal.permissionMode.cancel": "取消",
        "scheduled.modal.permissionMode.confirm": "确认",
        "scheduled.modal.frequency": "频率",
        "scheduled.modal.frequencyOptions.manual": "手动",
        "scheduled.modal.frequencyOptions.hourly": "每小时",
        "scheduled.modal.frequencyOptions.daily": "每天",
        "scheduled.modal.frequencyOptions.weekdays": "工作日",
        "scheduled.modal.frequencyOptions.weekly": "每周",
        "scheduled.modal.delayHint": "执行时间可能会有轻微延迟。",
        "scheduled.modal.cancel": "取消",
        "scheduled.modal.save": "创建",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} role="dialog">
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

mock.module("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, className }: { children: ReactNode; className?: string }) => (
    <button className={className} type="button">
      {children}
    </button>
  ),
  SelectValue: () => null,
}));

mock.module("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

mock.module("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <>{children}</> : null,
  AlertDialogAction: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

mock.module("@/lib/models", () => ({
  useAvailableModels: () => ({
    defaultModelId: "claude-default",
    models: [],
  }),
}));

const { NewScheduledModal } = require("./NewScheduledModal") as typeof import("./NewScheduledModal");

afterEach(() => {
  cleanup();
});

afterAll(() => {
  mock.restore();
});

describe("NewScheduledModal", () => {
  it("uses the system theme color for the create action", () => {
    render(<NewScheduledModal open onOpenChange={() => {}} />);

    const createButton = screen.getByRole("button", { name: "创建" });

    // 弹窗主操作必须走 primary token，跟随系统主题色。
    expect(createButton.className).toContain("bg-primary");
    expect(createButton.className).toContain("text-primary-foreground");
    expect(createButton.className).toContain("hover:bg-primary/90");
    expect(createButton.className).not.toContain("bg-text-100");
    expect(createButton.className).not.toContain("text-bg-100");
  });
});
