import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";

const meta: Meta<typeof ChainOfThought> = {
  title: "AI Elements/ChainOfThought",
  component: ChainOfThought,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof ChainOfThought>;

const reasoning = (
  <>
    <p>
      用户想要一份 Q4 报表的 xlsx 文件。我需要先扫描工作目录里现有的数据源，
      确认列结构后再生成表格。这个步骤不需要外部网络，全部本地完成。
    </p>
    <p>
      接下来调用 fs 工具读取 ~/Workspace/q4-data.csv，
      然后用 spreadsheet 工具把它转成带样式的 xlsx。
      最后把产物写到 ~/Workspace/q4-report.xlsx 并在右栏给个 artifact 引用。
    </p>
    <p>
      如果中间数据有缺失列，回退方案是直接提示用户补全；
      不要 silent-fill，否则报表语义会失真。
    </p>
  </>
);

export const Default: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <ChainOfThought>
        <ChainOfThoughtHeader>Reasoning</ChainOfThoughtHeader>
        <ChainOfThoughtContent>{reasoning}</ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  ),
};

export const Expanded: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <ChainOfThought defaultOpen>
        <ChainOfThoughtHeader>Reasoning</ChainOfThoughtHeader>
        <ChainOfThoughtContent>{reasoning}</ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <ChainOfThought defaultOpen>
          <ChainOfThoughtHeader>Reasoning</ChainOfThoughtHeader>
          <ChainOfThoughtContent>{reasoning}</ChainOfThoughtContent>
        </ChainOfThought>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <ChainOfThought defaultOpen>
          <ChainOfThoughtHeader>Reasoning</ChainOfThoughtHeader>
          <ChainOfThoughtContent>{reasoning}</ChainOfThoughtContent>
        </ChainOfThought>
      </div>
    </div>
  ),
};
