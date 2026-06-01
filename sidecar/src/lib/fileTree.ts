import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const MAX_DEPTH = 6;
export const MAX_FILES = 500;

export interface TreeNode {
  /** Relative path from the walked root, POSIX-style separators. */
  path: string;
  name: string;
  kind: "file" | "dir";
  /** Only present on directories. */
  children?: TreeNode[];
}

const SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "dist",
  "build",
  ".cache",
]);

// File name patterns dropped unconditionally. Mirrors the BashSideEffectsTracker
// deny list so the file tree and the Files Tab agree on what counts as "noise".
const DENY_NAME_REGEX = /^\.DS_Store$|^Thumbs\.db$|\.pyc$|\.swp$|~$/;

function shouldSkipDir(name: string): boolean {
  if (SKIP_DIRS.has(name)) return true;
  if (name.startsWith(".") && name.length > 1) return true;
  return false;
}

function shouldSkipFile(name: string): boolean {
  if (DENY_NAME_REGEX.test(name)) return true;
  // Skip dotfiles in the file tree — they're rarely interesting here (think
  // .gitignore, .editorconfig). Users who need them can open the dir directly.
  if (name.startsWith(".")) return true;
  return false;
}

/**
 * Walk `abs` recursively, returning a nested tree of files/dirs relative to it.
 * Caps depth and total file count to keep the response bounded (large repos
 * with node_modules/.git are pruned). Directories list even when empty; files
 * are alphabetical (dirs first) so UI tree state keyed by path is stable.
 *
 * Shared by the skill file tree and the agent-folder tree so the noise filter
 * (skip dirs / deny names) stays identical across both surfaces.
 */
export async function walkTree(
  abs: string,
  rel: string,
  depth: number,
  counter: { count: number },
): Promise<TreeNode[]> {
  if (depth > MAX_DEPTH) return [];
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: TreeNode[] = [];
  entries.sort((a, b) => {
    const aDir = a.isDirectory() ? 0 : 1;
    const bDir = b.isDirectory() ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  for (const entry of entries) {
    if (counter.count >= MAX_FILES) break;
    const name = entry.name;
    if (entry.isDirectory()) {
      if (shouldSkipDir(name)) continue;
      const childRel = rel ? `${rel}/${name}` : name;
      const children = await walkTree(join(abs, name), childRel, depth + 1, counter);
      out.push({ path: childRel, name, kind: "dir", children });
    } else if (entry.isFile()) {
      if (shouldSkipFile(name)) continue;
      counter.count += 1;
      const childRel = rel ? `${rel}/${name}` : name;
      out.push({ path: childRel, name, kind: "file" });
    }
  }
  return out;
}
