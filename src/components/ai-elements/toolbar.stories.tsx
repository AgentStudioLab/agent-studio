import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, RotateCw, ThumbsDown, ThumbsUp } from "lucide-react";

import { Toolbar, ToolbarButton } from "@/components/ai-elements/toolbar";

const meta: Meta<typeof Toolbar> = {
  title: "AI Elements/Toolbar",
  component: Toolbar,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Toolbar>;

const MessageBody = () => (
  <p className="text-sm text-foreground">
    这是一段 agent 回复。下面是悬浮显示的操作行：复制、点赞、点踩、重新生成。
  </p>
);

export const MessageActions: Story = {
  render: () => (
    <div className="group max-w-prose space-y-2">
      <MessageBody />
      <Toolbar className="-ml-1.5 pt-2">
        <ToolbarButton aria-label="复制">
          <Copy />
        </ToolbarButton>
        <ToolbarButton aria-label="点赞">
          <ThumbsUp />
        </ToolbarButton>
        <ToolbarButton aria-label="点踩">
          <ThumbsDown />
        </ToolbarButton>
        <ToolbarButton aria-label="重新生成">
          <RotateCw />
        </ToolbarButton>
      </Toolbar>
    </div>
  ),
};

export const WithLabels: Story = {
  render: () => (
    <Toolbar>
      <ToolbarButton className="w-auto gap-1.5 px-2 text-xs">
        <Copy />
        复制
      </ToolbarButton>
      <ToolbarButton className="w-auto gap-1.5 px-2 text-xs">
        <ThumbsUp />
        有用
      </ToolbarButton>
      <ToolbarButton className="w-auto gap-1.5 px-2 text-xs">
        <RotateCw />
        重新生成
      </ToolbarButton>
    </Toolbar>
  ),
};

const Sample = () => (
  <Toolbar>
    <ToolbarButton aria-label="复制">
      <Copy />
    </ToolbarButton>
    <ToolbarButton aria-label="点赞">
      <ThumbsUp />
    </ToolbarButton>
    <ToolbarButton aria-label="点踩">
      <ThumbsDown />
    </ToolbarButton>
    <ToolbarButton aria-label="重新生成">
      <RotateCw />
    </ToolbarButton>
  </Toolbar>
);

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Sample />
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <Sample />
      </div>
    </div>
  ),
};
