import { useMemo } from "react";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { useTranslation } from "react-i18next";
import { useAgentWorkspace } from "@/lib/data/agent-queries";
import { useAgentMemoryTree } from "@/lib/data/agent-memory-tree-queries";
import type { MemoryTreeNode } from "@/lib/data/agent-memory-tree";
import type { MockFile } from "@/lib/mock/types";
import type { OpenFolderFile } from "./AgentFoldersCard";

function fileTypeFromName(name: string): MockFile["type"] {
  return name.toLowerCase().endsWith(".md") ? "markdown" : "generic";
}

function collectFilePaths(nodes: MemoryTreeNode[], acc: Set<string>): Set<string> {
  for (const n of nodes) {
    if (n.kind === "file") acc.add(n.path);
    else collectFilePaths(n.children ?? [], acc);
  }
  return acc;
}

function renderNodes(nodes: MemoryTreeNode[]) {
  return nodes.map((n) =>
    n.kind === "dir" ? (
      <FileTreeFolder key={n.path} path={n.path} name={n.name}>
        {renderNodes(n.children ?? [])}
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={n.path} path={n.path} name={n.name} />
    ),
  );
}

/** Read-only file tree of the agent's <home>/memory/ (MEMORY.md index + scenario
 *  files). Clicking a file opens it in the PreviewPane (read-only). Memory is
 *  agent-written via the remember tool; users cannot edit it here. */
export function MemoryFilesCard({
  agentId,
  onOpenFile,
}: {
  agentId: string;
  onOpenFile?: OpenFolderFile;
}) {
  const { t } = useTranslation();
  const { data: agent } = useAgentWorkspace(agentId);
  const { data: tree, isLoading } = useAgentMemoryTree(agentId);
  const nodes = tree ?? [];
  const filePaths = useMemo(() => collectFilePaths(nodes, new Set<string>()), [nodes]);
  // memory dir = <home>/memory; the /files/content preview sandbox uses it as workingDir.
  const memoryDir = agent ? `${agent.homeDir}/memory` : "";

  const handleSelect = (relPath: string) => {
    // FileTree fires onSelect for folders too — only files open a preview.
    if (!onOpenFile || !filePaths.has(relPath) || !memoryDir) return;
    onOpenFile(
      {
        name: relPath.split("/").pop() ?? relPath,
        path: `${memoryDir}/${relPath}`,
        type: fileTypeFromName(relPath),
      },
      memoryDir,
    );
  };

  // Don't flash the empty state before the tree query resolves.
  if (isLoading) return null;
  if (nodes.length === 0) {
    return (
      <p className="py-0.5 text-sm text-muted-foreground">{t("agentSpace.memory.empty")}</p>
    );
  }
  return <FileTree onSelect={handleSelect}>{renderNodes(nodes)}</FileTree>;
}
