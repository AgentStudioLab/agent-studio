import type { Meta, StoryObj } from "@storybook/react-vite";
import { PreviewPane } from "@/features/task/PreviewPane";
import { workingTreeFiles } from "@/lib/mock/files";
import type { MockFile } from "@/lib/mock/types";

const meta: Meta<typeof PreviewPane> = {
  title: "Features/Task/PreviewPane",
  component: PreviewPane,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div
        style={{
          height: 600,
          display: "flex",
          justifyContent: "flex-end",
          background: "hsl(var(--bg-100))",
        }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PreviewPane>;

const findFile = (type: MockFile["type"]): MockFile => {
  const found = workingTreeFiles.find((f) => f.type === type);
  if (!found) throw new Error(`No mock file of type ${type}`);
  return found;
};

export const MarkdownContent: Story = {
  args: { file: findFile("markdown"), workingDir: null, onClose: () => {} },
};

export const SpreadsheetContent: Story = {
  args: { file: findFile("spreadsheet"), workingDir: null, onClose: () => {} },
};

export const PresentationContent: Story = {
  args: { file: findFile("presentation"), workingDir: null, onClose: () => {} },
};

export const CodeContent: Story = {
  args: { file: findFile("code"), workingDir: null, onClose: () => {} },
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1rem",
        padding: "1rem",
        height: 600,
      }}
    >
      <div
        style={{
          background: "hsl(var(--bg-100))",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <PreviewPane file={findFile("markdown")} workingDir={null} onClose={() => {}} />
      </div>
      <div
        data-mode="dark"
        style={{
          background: "hsl(var(--bg-100))",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <PreviewPane file={findFile("markdown")} workingDir={null} onClose={() => {}} />
      </div>
    </div>
  ),
};
