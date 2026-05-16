import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageIcon } from "lucide-react";

import { Canvas } from "@/components/ai-elements/canvas";

const meta: Meta<typeof Canvas> = {
  title: "AI Elements/Canvas",
  component: Canvas,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Canvas>;

const HtmlBody = () => (
  <div className="p-6 space-y-3">
    <h2 className="font-serif text-lg font-medium text-foreground">
      Q4 项目分析
    </h2>
    <p className="text-sm text-muted-foreground">
      下面是本季度三个闲置项目的占用统计，按可释放空间排序。
    </p>
    <div className="flex h-32 items-center justify-center rounded-sm bg-muted/40 text-xs text-muted-foreground">
      <ImageIcon className="mr-2 size-4" />
      image placeholder · 720 × 320
    </div>
    <p className="text-sm text-muted-foreground">
      点击右上角下载按钮可保存为 PDF；本预览不与远端同步。
    </p>
  </div>
);

export const HtmlContent: Story = {
  render: () => (
    <div style={{ maxWidth: 640 }}>
      <Canvas>
        <HtmlBody />
      </Canvas>
    </div>
  ),
};

export const Empty: Story = {
  render: () => (
    <div style={{ maxWidth: 640 }}>
      <Canvas>
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          暂无预览内容
        </div>
      </Canvas>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Canvas>
          <HtmlBody />
        </Canvas>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <Canvas>
          <HtmlBody />
        </Canvas>
      </div>
    </div>
  ),
};
