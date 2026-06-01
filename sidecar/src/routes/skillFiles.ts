import { Hono } from "hono";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, resolve, basename } from "node:path";
import type { SkillRegistry } from "../services/skillRegistry";
import { walkTree, MAX_FILES } from "../lib/fileTree";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB — matches /files/content

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
    const tree = await walkTree(skillDirAbs, "", 0, counter);
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
