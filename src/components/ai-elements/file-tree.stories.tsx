import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import {
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

const meta: Meta<typeof FileTree> = {
  title: "AI Elements/FileTree",
  component: FileTree,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof FileTree>;

// Map file extension → (icon, semantic color class)
// .md       → FileText      → accent-100 (blue, info-like)
// .xlsx     → Spreadsheet   → success-100 (green)
// .pptx     → Presentation  → brand-100 (orange terracotta)
// .ts/.tsx  → Code-ish      → accent-pro-100 (purple)
// otherwise → File          → muted-foreground
const iconFor = (
  name: string
): { Icon: LucideIcon; colorClass: string } => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md") {
    return { Icon: FileTextIcon, colorClass: "text-[hsl(var(--accent-100))]" };
  }
  if (ext === "xlsx" || ext === "csv") {
    return {
      Icon: FileSpreadsheetIcon,
      colorClass: "text-[hsl(var(--success-100))]",
    };
  }
  if (ext === "pptx" || ext === "key") {
    return {
      Icon: PresentationIcon,
      colorClass: "text-[hsl(var(--brand-100))]",
    };
  }
  if (ext === "tsx" || ext === "ts" || ext === "js" || ext === "jsx") {
    return {
      Icon: FileTextIcon,
      colorClass: "text-[hsl(var(--accent-pro-100))]",
    };
  }
  return { Icon: FileIcon, colorClass: "text-muted-foreground" };
};

const NewBadge = () => (
  <span
    className="ml-auto rounded-sm px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide"
    style={{
      background: "hsl(var(--success-100) / 0.2)",
      color: "hsl(var(--success-100))",
    }}
  >
    new
  </span>
);

type TypedFileProps = {
  path: string;
  name: string;
  isNew?: boolean;
};

const TypedFile = ({ path, name, isNew }: TypedFileProps) => {
  const { Icon, colorClass } = iconFor(name);
  // When `isNew` we render children manually so we can append the badge.
  // Otherwise we just pass `icon` and let the component render its default layout.
  if (isNew) {
    return (
      <FileTreeFile name={name} path={path}>
        <span className="size-4 shrink-0" />
        <span className="shrink-0">
          <Icon className={`size-4 ${colorClass}`} />
        </span>
        <span className="truncate">{name}</span>
        <NewBadge />
      </FileTreeFile>
    );
  }
  return (
    <FileTreeFile
      icon={<Icon className={`size-4 ${colorClass}`} />}
      name={name}
      path={path}
    />
  );
};

const Shell = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: "320px" }}>{children}</div>
);

export const WorkingTree: Story = {
  render: () => (
    <Shell>
      <FileTree defaultExpanded={new Set(["/project", "/project/docs"])}>
        <FileTreeFolder name="project" path="/project">
          <TypedFile name="report.xlsx" path="/project/report.xlsx" />
          <TypedFile name="plan.md" path="/project/plan.md" />
          <TypedFile name="slides.pptx" path="/project/slides.pptx" />
          <FileTreeFolder name="docs" path="/project/docs">
            <TypedFile name="overview.md" path="/project/docs/overview.md" />
            <TypedFile name="readme.txt" path="/project/docs/readme.txt" />
          </FileTreeFolder>
          <FileTreeFolder name="src" path="/project/src">
            <TypedFile name="app.tsx" path="/project/src/app.tsx" />
            <TypedFile name="utils.ts" path="/project/src/utils.ts" />
          </FileTreeFolder>
        </FileTreeFolder>
      </FileTree>
    </Shell>
  ),
};

export const WithNewLabels: Story = {
  render: () => (
    <Shell>
      <FileTree defaultExpanded={new Set(["/working-tree"])}>
        <FileTreeFolder name="working-tree" path="/working-tree">
          <TypedFile isNew name="q4-report.xlsx" path="/working-tree/q4-report.xlsx" />
          <TypedFile isNew name="plan.md" path="/working-tree/plan.md" />
          <TypedFile name="legacy.pptx" path="/working-tree/legacy.pptx" />
          <TypedFile isNew name="notes.md" path="/working-tree/notes.md" />
        </FileTreeFolder>
      </FileTree>
    </Shell>
  ),
};

export const Empty: Story = {
  render: () => (
    <Shell>
      <FileTree>
        <div className="px-2 py-6 text-center text-muted-foreground text-xs">
          Agent 还没生成任何文件
        </div>
      </FileTree>
    </Shell>
  ),
};

export const SideBySide: Story = {
  render: () => {
    const inner = (
      <FileTree defaultExpanded={new Set(["/project"])}>
        <FileTreeFolder name="project" path="/project">
          <TypedFile isNew name="report.xlsx" path="/project/report.xlsx" />
          <TypedFile name="plan.md" path="/project/plan.md" />
          <TypedFile name="slides.pptx" path="/project/slides.pptx" />
          <TypedFile name="app.tsx" path="/project/app.tsx" />
        </FileTreeFolder>
      </FileTree>
    );
    return (
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}
      >
        <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
          {inner}
        </div>
        <div
          data-mode="dark"
          style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
        >
          {inner}
        </div>
      </div>
    );
  },
};
