import type { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export interface SkillView {
  /** Unique id. Personal: frontmatter.name. Built-in: `agent-studio:<name>`. */
  id: string;
  /** Display name from SKILL.md frontmatter. */
  name: string;
  /** Display description from SKILL.md frontmatter. */
  description: string;
  /** Where the skill lives — drives UI grouping. */
  source: "personal" | "builtin";
  /** Absolute path of the parent source directory. UI shows this for personal. */
  sourcePath: string;
  /** Effective on/off after merging SQLite state with the default (enabled). */
  enabled: boolean;
}

/** Discovered skill without SQLite state merged in. */
interface RegistryEntry {
  id: string;
  name: string;
  description: string;
  source: "personal" | "builtin";
  sourcePath: string;
}

interface SkillStateRow {
  skill_id: string;
  enabled: number;
}

interface SkillFrontmatter {
  name?: unknown;
  description?: unknown;
  [k: string]: unknown;
}

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---/;

function parseFrontmatter(raw: string): SkillFrontmatter | null {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return null;
  try {
    const out = yaml.load(m[1]!);
    return typeof out === "object" && out !== null ? (out as SkillFrontmatter) : null;
  } catch {
    return null;
  }
}

function resolveBuiltinDir(): string | null {
  const fromEnv = process.env.AGENT_STUDIO_BUILTIN_DIR;
  if (fromEnv !== undefined) {
    // Env is explicitly set — production path. Don't silently fall back to
    // the dev path; if the configured directory is missing that's a packaging
    // bug we want to surface (returns null → provider runs without builtin
    // plugin → log warn on boot).
    return existsSync(fromEnv) ? fromEnv : null;
  }
  // Dev fallback: walk up from this file to project root, expect `built-in/`.
  // sidecar/src/services/skillRegistry.ts → up 3 → agent-studio/built-in
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const guess = resolve(here, "../../../built-in");
    if (existsSync(guess)) return guess;
  } catch {
    // import.meta.url not available — give up silently.
  }
  return null;
}

/**
 * Scan one source directory for `<name>/SKILL.md` skills.
 *
 * - Missing directory → empty array (no error).
 * - Subdirectories without SKILL.md → skipped silently.
 * - SKILL.md with missing/empty `name` or `description` → warn + skip.
 * - YAML parse failure → warn + skip.
 *
 * Returned entries are NOT yet de-duplicated against other sources — caller
 * is responsible for merge-with-first-wins semantics.
 */
export function scanSourceDir(
  dir: string,
  source: "personal" | "builtin",
): RegistryEntry[] {
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    console.warn(`[skillRegistry] readdir failed: ${dir}`, err);
    return [];
  }

  const out: RegistryEntry[] = [];
  for (const name of names) {
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const mdPath = join(full, "SKILL.md");
    if (!existsSync(mdPath)) continue;

    let raw: string;
    try {
      raw = readFileSync(mdPath, "utf8");
    } catch (err) {
      console.warn(`[skillRegistry] read failed: ${mdPath}`, err);
      continue;
    }

    const fm = parseFrontmatter(raw);
    if (!fm) {
      console.warn(`[skillRegistry] missing/invalid frontmatter: ${mdPath}`);
      continue;
    }
    const fmName = typeof fm.name === "string" ? fm.name.trim() : "";
    const fmDesc = typeof fm.description === "string" ? fm.description.trim() : "";
    if (!fmName || !fmDesc) {
      console.warn(`[skillRegistry] frontmatter missing name/description: ${mdPath}`);
      continue;
    }

    const id = source === "builtin" ? `agent-studio:${fmName}` : fmName;
    out.push({
      id,
      name: fmName,
      description: fmDesc,
      source,
      sourcePath: dir,
    });
  }
  return out;
}

/**
 * Discovers SKILL.md folders across three sources and merges with a
 * SQLite-backed enable/disable state.
 *
 * Discovery order (first-wins on duplicate id):
 *   1. ~/.agent-studio/skills/    (personal — Studio-namespace)
 *   2. ~/.claude/skills/          (personal — Claude Code ecosystem)
 *   3. <builtinDir>/skills/       (builtin  — Agent Studio ships)
 *
 * On duplicate id the second occurrence is dropped with a warn — keeps the
 * "Studio user skills win over Claude shared skills win over what we ship"
 * mental model.
 *
 * Orphan SQLite rows (state for skill_ids no longer on disk) are kept
 * untouched. They're invisible to `listSkills()` but resurrect if the
 * skill folder reappears with the same id.
 */
export class SkillRegistry {
  protected db: Database;
  protected entries: RegistryEntry[] = [];
  protected builtinDir: string | null;
  protected initialized = false;

  constructor(db: Database) {
    this.db = db;
    this.builtinDir = resolveBuiltinDir();
  }

  /** Re-runs the disk scan. Call from server boot and any time the user
   *  explicitly asks to "refresh" (none today, but cheap to keep). */
  init(): void {
    const sources: Array<{ dir: string; source: "personal" | "builtin" }> = [
      { dir: join(homedir(), ".agent-studio", "skills"), source: "personal" },
      { dir: join(homedir(), ".claude", "skills"),       source: "personal" },
    ];
    if (this.builtinDir) {
      sources.push({ dir: join(this.builtinDir, "skills"), source: "builtin" });
    }

    const seen = new Map<string, RegistryEntry>();
    for (const src of sources) {
      const found = scanSourceDir(src.dir, src.source);
      for (const e of found) {
        if (seen.has(e.id)) {
          console.warn(
            `[skillRegistry] duplicate skill id "${e.id}" at ${e.sourcePath} — first one wins`,
          );
          continue;
        }
        seen.set(e.id, e);
      }
    }
    this.entries = [...seen.values()];
    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) this.init();
  }

  private getStateMap(): Map<string, boolean> {
    const rows = this.db
      .prepare<SkillStateRow, []>("SELECT skill_id, enabled FROM skill_state")
      .all();
    const m = new Map<string, boolean>();
    for (const r of rows) m.set(r.skill_id, r.enabled === 1);
    return m;
  }

  listSkills(): SkillView[] {
    this.ensureInitialized();
    const state = this.getStateMap();
    return this.entries.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      source: e.source,
      sourcePath: e.sourcePath,
      enabled: state.get(e.id) ?? true, // default ON
    }));
  }

  /** Returns ids of currently-enabled skills. Used by provider.ts to drive
   *  the SDK's `skills` option. Includes only skills present in the live
   *  registry — orphan SQLite rows can't leak in. */
  listEnabledIds(): string[] {
    this.ensureInitialized();
    const state = this.getStateMap();
    const out: string[] = [];
    for (const e of this.entries) {
      if ((state.get(e.id) ?? true) === true) out.push(e.id);
    }
    return out;
  }

  /**
   * Persist a toggle. Returns true on success, false if skill_id is not
   * in the current registry — routes layer maps that to a 404.
   */
  setEnabled(skillId: string, enabled: boolean): boolean {
    this.ensureInitialized();
    if (!this.entries.some((e) => e.id === skillId)) return false;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO skill_state (skill_id, enabled, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(skill_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(skillId, enabled ? 1 : 0, now);
    return true;
  }

  /** Returns absolute path to the built-in plugin dir IF it exists AND
   *  contains a valid `.claude-plugin/plugin.json`. Provider.ts uses this
   *  to decide whether to pass `plugins: [...]` to the SDK. */
  builtinPluginPath(): string | null {
    if (!this.builtinDir) return null;
    const manifest = join(this.builtinDir, ".claude-plugin", "plugin.json");
    return existsSync(manifest) ? this.builtinDir : null;
  }
}
