import type { MockFile } from "./types";

export const workingTreeFiles: MockFile[] = [
  {
    name: "Q4-report.xlsx",
    path: "~/Workspace/inactive-report/Q4-report.xlsx",
    type: "spreadsheet",
    isNew: true,
    content:
      "Project,Last commit,Days idle,Status\n" +
      "old-project-1,2024-02-15,287,inactive\n" +
      "legacy-dashboard,2024-03-22,252,inactive\n" +
      "old-project-2,2024-08-03,118,stale\n" +
      "sketch-tool,2025-01-09,127,stale\n" +
      "agent-studio,2026-05-16,0,active\n",
  },
  {
    name: "slides.pptx",
    path: "~/Workspace/inactive-report/slides.pptx",
    type: "presentation",
    isNew: true,
    // pptx preview rendered via mock slides in PreviewPane (no raw text content)
    content: undefined,
  },
  {
    name: "summary.md",
    path: "~/Workspace/inactive-report/summary.md",
    type: "markdown",
    content:
      "# 不活跃项目扫描报告\n\n" +
      "## 概览\n\n" +
      "本次扫描共发现 5 个项目，其中 2 个超过 250 天未提交。\n\n" +
      "## 明细\n\n" +
      "- **old-project-1** — 287 天未动，建议归档\n" +
      "- **legacy-dashboard** — 252 天未动，建议归档\n" +
      "- **old-project-2** — 118 天未动，观察一个月\n" +
      "- **sketch-tool** — 127 天未动，观察一个月\n" +
      "- **agent-studio** — 活跃中，保留\n\n" +
      "## 下一步\n\n" +
      "见 `plan.md`。\n",
  },
  {
    name: "scan.ts",
    path: "~/Workspace/inactive-report/scripts/scan.ts",
    type: "code",
    content:
      "import { readdir, stat } from 'node:fs/promises';\n" +
      "import { join } from 'node:path';\n\n" +
      "export interface ProjectEntry {\n" +
      "  name: string;\n" +
      "  path: string;\n" +
      "  lastCommit: Date;\n" +
      "}\n\n" +
      "export async function scanWorkspace(root: string): Promise<ProjectEntry[]> {\n" +
      "  const entries = await readdir(root, { withFileTypes: true });\n" +
      "  const projects: ProjectEntry[] = [];\n" +
      "  for (const entry of entries) {\n" +
      "    if (!entry.isDirectory()) continue;\n" +
      "    const projectPath = join(root, entry.name);\n" +
      "    const gitHead = join(projectPath, '.git', 'HEAD');\n" +
      "    try {\n" +
      "      const stats = await stat(gitHead);\n" +
      "      projects.push({ name: entry.name, path: projectPath, lastCommit: stats.mtime });\n" +
      "    } catch {\n" +
      "      // not a git repo, skip\n" +
      "    }\n" +
      "  }\n" +
      "  return projects.sort((a, b) => b.lastCommit.getTime() - a.lastCommit.getTime());\n" +
      "}\n",
  },
  {
    name: "plan.md",
    path: "~/Workspace/inactive-report/plan.md",
    type: "markdown",
    content:
      "# 清理计划\n\n" +
      "1. 归档 287 天未动的 `old-project-1`，移到 `~/Archive/`\n" +
      "2. 归档 252 天未动的 `legacy-dashboard`，移到 `~/Archive/`\n" +
      "3. 给 `old-project-2` 和 `sketch-tool` 留 30 天观察期\n" +
      "4. 一个月后重新扫描，决定是否归档观察组\n\n" +
      "## 备注\n\n" +
      "归档前确认远程 mirror 已同步。\n",
  },
];
