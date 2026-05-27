import { useTranslation } from "react-i18next";
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree";
import { useSkillTree, type SkillTreeNode } from "@/lib/agui/react/useSkillFiles";

interface SkillFileTreeProps {
  skillId: string;
  /** Currently-previewed file's relative path, or undefined when none. */
  selectedPath?: string;
  onSelect: (relPath: string) => void;
}

/**
 * Recursive renderer — emits FileTreeFolder / FileTreeFile from the backend's
 * nested node shape. Pulled out as a top-level function (not a closure) so
 * React can preserve identity across re-renders.
 */
function renderNodes(nodes: SkillTreeNode[]): React.ReactNode {
  return nodes.map((node) =>
    node.kind === "dir" ? (
      <FileTreeFolder key={node.path} path={node.path} name={node.name}>
        {renderNodes(node.children ?? [])}
      </FileTreeFolder>
    ) : (
      <FileTreeFile key={node.path} path={node.path} name={node.name} />
    ),
  );
}

/**
 * Renders the file listing of a personal skill as an interactive tree. Lives
 * inline under the active SkillCard in Customize > Skills. Selection is
 * controlled by the parent (so the right pane preview stays in sync) — only
 * folder expansion is managed locally inside ai-elements' FileTree.
 */
export function SkillFileTree({
  skillId,
  selectedPath,
  onSelect,
}: SkillFileTreeProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useSkillTree(skillId);

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {t("customize.skills.files.loading", { defaultValue: "Loading files…" })}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-3 py-2 text-xs text-destructive-foreground">
        {(error as Error | undefined)?.message ?? "tree error"}
      </div>
    );
  }
  if (!data || data.tree.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {t("customize.skills.files.empty", { defaultValue: "No files" })}
      </div>
    );
  }

  return (
    <FileTree
      selectedPath={selectedPath}
      onSelect={onSelect}
      className="rounded-none border-0 bg-transparent p-0 text-[12.5px]"
    >
      {renderNodes(data.tree)}
    </FileTree>
  );
}
