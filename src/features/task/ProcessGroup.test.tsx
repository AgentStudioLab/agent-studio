import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { ProcessStep } from "./ProcessGroup";

mock.module("@/components/ai-elements/code-block", () => ({
  CodeBlock: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CodeBlockActions: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CodeBlockCopyButton: () => null,
  CodeBlockFilename: ({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  ),
  CodeBlockHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CodeBlockTitle: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

mock.module("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  CollapsibleTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const testI18n = i18n.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "zh",
  resources: {
    zh: {
      translation: {
        task: {
          processGroup: {
            done: "完成",
            fallback: {
              file: "文件",
            },
            toolTitles: {
              bash: "正在运行命令",
              read: "读取 {{file}}",
              skill: "使用技能",
            },
            summary: {
              listSeparator: "，",
              thought: "思考中",
              readFile: {
                one: "读取了 {{count}} 个文件",
                other: "读取了 {{count}} 个文件",
              },
              ranCommand: {
                one: "运行了 {{count}} 条命令",
                other: "运行了 {{count}} 条命令",
              },
              usedSkill: {
                one: "使用了 {{count}} 个技能",
                other: "使用了 {{count}} 个技能",
              },
            },
          },
        },
      },
    },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

function renderProcessGroup(steps: ProcessStep[], done = false) {
  const { ProcessGroup } =
    require("./ProcessGroup") as typeof import("./ProcessGroup");

  return render(
    <I18nextProvider i18n={testI18n}>
      <ProcessGroup steps={steps} done={done} />
    </I18nextProvider>,
  );
}

describe("ProcessGroup", () => {
  afterEach(() => cleanup());

  it("renders tool progress chrome in Chinese for zh locale", () => {
    renderProcessGroup([
      {
        kind: "tool_call",
        tool: {
          id: "skill-1",
          toolName: "Skill",
          args: { skill: "agent-studio:xlsx" },
          result: null,
          status: "success",
        },
      },
      {
        kind: "tool_call",
        tool: {
          id: "read-1",
          toolName: "Read",
          args: { file_path: "/tmp/promotion_test_data.py" },
          result: null,
          status: "success",
        },
      },
      {
        kind: "tool_call",
        tool: {
          id: "bash-1",
          toolName: "Bash",
          args: { command: "python make_excel.py" },
          result: null,
          status: "success",
        },
      },
    ]);

    expect(
      screen.getByRole("button", {
        name: "使用了 1 个技能，读取了 1 个文件，运行了 1 条命令",
      }),
    ).toBeDefined();
    expect(screen.getByText("使用技能")).toBeDefined();
    expect(screen.getByText("读取 promotion_test_data.py")).toBeDefined();
    expect(screen.getByText("正在运行命令")).toBeDefined();
  });

  it("renders the done row in Chinese after expanding a completed group", () => {
    renderProcessGroup(
      [{ kind: "reasoning", id: "r1", content: "已经完成上下文整理。" }],
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "思考中" }));

    expect(screen.getByText("完成")).toBeDefined();
  });
});
