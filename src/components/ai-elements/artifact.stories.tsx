import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactClose,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import {
  CopyIcon,
  DownloadIcon,
  FileCodeIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PresentationIcon,
} from "lucide-react";

const meta: Meta<typeof Artifact> = {
  title: "AI Elements/Artifact",
  component: Artifact,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Artifact>;

const SpreadsheetPreview = () => (
  <div className="font-mono text-xs leading-relaxed text-foreground">
    <div className="grid grid-cols-4 gap-2 border-b border-border pb-2 font-semibold text-muted-foreground">
      <span>项目</span>
      <span>最近提交</span>
      <span>大小</span>
      <span>可释放</span>
    </div>
    <div className="grid grid-cols-4 gap-2 py-1.5">
      <span>old-cms</span>
      <span>2024-08-12</span>
      <span>1.2 GB</span>
      <span>820 MB</span>
    </div>
    <div className="grid grid-cols-4 gap-2 py-1.5">
      <span>legacy-api</span>
      <span>2024-06-03</span>
      <span>640 MB</span>
      <span>490 MB</span>
    </div>
    <div className="grid grid-cols-4 gap-2 py-1.5">
      <span>poc-vector</span>
      <span>2024-02-19</span>
      <span>318 MB</span>
      <span>290 MB</span>
    </div>
  </div>
);

export const Spreadsheet: Story = {
  render: () => (
    <div style={{ maxWidth: "640px" }}>
      <Artifact>
        <ArtifactHeader>
          <div className="flex min-w-0 items-center gap-2">
            <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <ArtifactTitle className="truncate">Q4 报表.xlsx</ArtifactTitle>
              <ArtifactDescription>Spreadsheet · 4 sheets</ArtifactDescription>
            </div>
          </div>
          <ArtifactActions>
            <ArtifactAction icon={CopyIcon} label="Copy" tooltip="Copy" />
            <ArtifactAction
              icon={DownloadIcon}
              label="Download"
              tooltip="Download"
            />
            <ArtifactClose />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent>
          <SpreadsheetPreview />
        </ArtifactContent>
      </Artifact>
    </div>
  ),
};

export const Presentation: Story = {
  render: () => (
    <div style={{ maxWidth: "640px" }}>
      <Artifact>
        <ArtifactHeader>
          <div className="flex min-w-0 items-center gap-2">
            <PresentationIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <ArtifactTitle className="truncate">项目分析.pptx</ArtifactTitle>
              <ArtifactDescription>Presentation · 12 slides</ArtifactDescription>
            </div>
          </div>
          <ArtifactActions>
            <ArtifactAction icon={DownloadIcon} label="Download" tooltip="Download" />
            <ArtifactClose />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent>
          <div className="flex h-40 items-center justify-center rounded-sm bg-muted/40 text-sm text-muted-foreground">
            Slide 1 / 12 · 封面
          </div>
        </ArtifactContent>
      </Artifact>
    </div>
  ),
};

export const Document: Story = {
  render: () => (
    <div style={{ maxWidth: "640px" }}>
      <Artifact>
        <ArtifactHeader>
          <div className="flex min-w-0 items-center gap-2">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <ArtifactTitle className="truncate">README.md</ArtifactTitle>
              <ArtifactDescription>Markdown · 42 lines</ArtifactDescription>
            </div>
          </div>
          <ArtifactActions>
            <ArtifactAction icon={CopyIcon} label="Copy" tooltip="Copy" />
            <ArtifactClose />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent>
          <div className="space-y-2 text-sm text-foreground">
            <h2 className="font-serif text-base font-medium">Agent Studio</h2>
            <p className="text-muted-foreground">
              本地优先的 agent 工作台，sidecar 跑 Claude Agent SDK，Tauri 壳负责持久化和窗口。
            </p>
            <p className="text-muted-foreground">
              安装：<code className="font-mono text-xs">bun install && bun run tauri:dev</code>
            </p>
          </div>
        </ArtifactContent>
      </Artifact>
    </div>
  ),
};

export const Code: Story = {
  render: () => (
    <div style={{ maxWidth: "640px" }}>
      <Artifact>
        <ArtifactHeader>
          <div className="flex min-w-0 items-center gap-2">
            <FileCodeIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <ArtifactTitle className="truncate">scan.ts</ArtifactTitle>
              <ArtifactDescription>TypeScript · 28 lines</ArtifactDescription>
            </div>
          </div>
          <ArtifactActions>
            <ArtifactAction icon={CopyIcon} label="Copy" tooltip="Copy" />
            <ArtifactClose />
          </ArtifactActions>
        </ArtifactHeader>
        <ArtifactContent>
          <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-foreground">
            {`import { readdir } from "node:fs/promises";

export async function scanInactive(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}`}
          </pre>
        </ArtifactContent>
      </Artifact>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Artifact>
          <ArtifactHeader>
            <div className="flex min-w-0 items-center gap-2">
              <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <ArtifactTitle className="truncate">Q4 报表.xlsx</ArtifactTitle>
                <ArtifactDescription>Spreadsheet · 4 sheets</ArtifactDescription>
              </div>
            </div>
            <ArtifactActions>
              <ArtifactClose />
            </ArtifactActions>
          </ArtifactHeader>
          <ArtifactContent>
            <SpreadsheetPreview />
          </ArtifactContent>
        </Artifact>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <Artifact>
          <ArtifactHeader>
            <div className="flex min-w-0 items-center gap-2">
              <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <ArtifactTitle className="truncate">Q4 报表.xlsx</ArtifactTitle>
                <ArtifactDescription>Spreadsheet · 4 sheets</ArtifactDescription>
              </div>
            </div>
            <ArtifactActions>
              <ArtifactClose />
            </ArtifactActions>
          </ArtifactHeader>
          <ArtifactContent>
            <SpreadsheetPreview />
          </ArtifactContent>
        </Artifact>
      </div>
    </div>
  ),
};
