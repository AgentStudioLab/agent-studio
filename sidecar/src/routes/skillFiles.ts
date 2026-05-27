import { Hono } from "hono";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, normalize, resolve, basename } from "node:path";
import type { SkillRegistry } from "../services/skillRegistry";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB — matches /files/content
const MAX_DEPTH = 6;
const MAX_FILES = 500;

interface TreeNode {
  /** Relative path from the skill directory, POSIX-style separators. */
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
  // Skip dotfiles in the file tree — they're rarely interesting in the
  // Customize view (think .gitignore, .editorconfig). Users who actually
  // need to inspect them can still open the directory in their editor.
  if (name.startsWith(".")) return true;
  return false;
}

/**
 * Walk `absRoot` recursively, returning a nested tree of files/dirs relative
 * to it. Caps depth and total file count to keep the response bounded.
 *
 * Directories are listed even when empty (after filtering) — the user might
 * find that signal useful ("this skill has an empty scripts/ dir"). Files
 * use a stable alphabetical order so the UI doesn't reshuffle on refetch.
 */
async function walkTree(
  absRoot: string,
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
  // Sort: directories first, then files; alphabetical within each group.
  // Stable order means UI tree state (expanded set) keyed by path is safe.
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
      const childAbs = join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      const children = await walkTree(absRoot, childAbs, childRel, depth + 1, counter);
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

/**
 * Resolve a personal skill's absolute directory: `<sourcePath>/<name>`. The
 * registry stores `sourcePath` as the parent directory (e.g. `~/.claude/skills`)
 * and `name` as the folder name, so the skill dir lives at the join. Built-in
 * skills are gated by source check upstream.
 */
function resolveSkillDir(sourcePath: string, name: string): string {
  return resolve(normalize(join(sourcePath, name)));
}

/**
 * Validate a user-supplied relative path resolves inside the skill dir.
 * Returns the absolute path on success, or null if the path escapes the
 * boundary (e.g. `..` segments, absolute traversal). Same model as
 * /files/content's cwd boundary check.
 */
function resolveWithinSkillDir(skillDirAbs: string, requested: string): string | null {
  const absRequested = resolve(normalize(join(skillDirAbs, requested)));
  const prefix = skillDirAbs.endsWith("/") ? skillDirAbs : skillDirAbs + "/";
  if (absRequested !== skillDirAbs && !absRequested.startsWith(prefix)) {
    return null;
  }
  return absRequested;
}

/**
 * GET /skills/:skillId/tree — recursive listing of a personal skill's files.
 * GET /skills/:skillId/files?path=<rel> — content of a single file in it.
 *
 * Both routes are gated by `source === "personal"`. Built-in skills ship with
 * the binary and are presumed read-only / opaque from the user's perspective,
 * so we don't surface their contents through the customize panel.
 */
export function buildSkillFilesRoutes(registry: SkillRegistry): Hono {
  const app = new Hono();

  app.get("/skills/:skillId/tree", async (c) => {
    const skillId = decodeURIComponent(c.req.param("skillId"));
    const skill = registry.getById(skillId);
    if (!skill) return c.json({ error: "skill not found" }, 404);
    if (skill.source !== "personal") {
      return c.json({ error: "built-in skills are read-only" }, 403);
    }

    const skillDirAbs = resolveSkillDir(skill.sourcePath, skill.name);
    let stats;
    try {
      stats = await stat(skillDirAbs);
    } catch {
      return c.json({ error: "skill directory missing" }, 404);
    }
    if (!stats.isDirectory()) {
      return c.json({ error: "skill directory is not a directory" }, 500);
    }

    const counter = { count: 0 };
    const tree = await walkTree(skillDirAbs, skillDirAbs, "", 0, counter);
    return c.json({
      skillId,
      root: basename(skillDirAbs),
      tree,
      truncated: counter.count >= MAX_FILES,
    });
  });

  app.get("/skills/:skillId/files", async (c) => {
    const skillId = decodeURIComponent(c.req.param("skillId"));
    const requested = c.req.query("path");
    if (!requested) return c.json({ error: "missing path" }, 400);

    const skill = registry.getById(skillId);
    if (!skill) return c.json({ error: "skill not found" }, 404);
    if (skill.source !== "personal") {
      return c.json({ error: "built-in skills are read-only" }, 403);
    }

    const skillDirAbs = resolveSkillDir(skill.sourcePath, skill.name);
    const abs = resolveWithinSkillDir(skillDirAbs, requested);
    if (!abs) return c.json({ error: "path outside skill" }, 403);

    let stats;
    try {
      stats = await stat(abs);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return c.json({ error: "not found" }, 404);
      return c.json({ error: "read failed", detail: String(err) }, 500);
    }
    if (!stats.isFile()) return c.json({ error: "not a file" }, 404);
    if (stats.size > MAX_BYTES) {
      return c.json({ error: "file too large", size: stats.size }, 413);
    }

    let buf: Buffer;
    try {
      buf = await readFile(abs);
    } catch (err) {
      return c.json({ error: "read failed", detail: String(err) }, 500);
    }

    // Same binary heuristic as /files/content: null byte or UTF-8 replacement
    // char → base64. Keeps the response shape interchangeable so the frontend
    // can reuse the same renderer dispatch.
    if (buf.includes(0)) {
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64" as const,
        size: stats.size,
      });
    }
    const utf8 = buf.toString("utf8");
    if (utf8.includes("�")) {
      return c.json({
        content: buf.toString("base64"),
        encoding: "base64" as const,
        size: stats.size,
      });
    }
    return c.json({
      content: utf8,
      encoding: "utf8" as const,
      size: stats.size,
    });
  });

  return app;
}
