// sidecar/src/services/agentMemoryStore.ts
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { walkTree, type TreeNode } from "../lib/fileTree";
import type { AgentWorkspaceService } from "./agentWorkspaces";

export const MEMORY_DIR = "memory";
export const MEMORY_INDEX = "MEMORY.md";

/** Always-on index budget (chars; tokenizer-free proxy). Only the index is
 *  injected, so this caps the always-on cost. */
export const MEMORY_INDEX_BUDGET = { soft: 2000, warn: 1600, hard: 2800 };

const INDEX_HEADER =
  "# Memory index\n\n" +
  "<!-- One line per scenario memory: - [Title](slug.md) — hook. " +
  "Read the linked file for detail. Maintained by the remember tool. -->\n\n";

export type MemoryEditResult =
  | { status: "ok"; message: string }
  | { status: "not_found" };

export interface MemorySaveInput {
  /** scenario slug, without .md */
  file: string;
  title: string;
  hook: string;
  content: string;
}

/** kebab-case, strip path separators / .md / unsafe chars. */
export function sanitizeSlug(file: string): string {
  const s = file
    .trim()
    .replace(/\.md$/i, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "") // strip leading/trailing dots+dashes (no dotfiles)
    .toLowerCase()
    .slice(0, 80);
  // Empty after sanitizing, or "memory" (collides with MEMORY.md on
  // case-insensitive macOS/Windows filesystems) → safe fallback.
  return s && s !== "memory" ? s : "memory-file";
}

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/** Matches a `- [title](slug.md) — hook` line, anchored to the link so a slug
 *  name inside another entry's hook/title can't false-match. */
function entryLineRe(slug: string): RegExp {
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^- \\[[^\\]]*\\]\\(${esc}\\.md\\)`);
}

/** Upsert a `- [title](slug.md) — hook` line keyed by the slug link. */
export function upsertIndexLine(indexPath: string, slug: string, title: string, hook: string): void {
  const line = `- [${title}](${slug}.md) — ${hook}`;
  const cur = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : INDEX_HEADER;
  const re = entryLineRe(slug);
  const lines = cur.split("\n");
  const i = lines.findIndex((l) => re.test(l));
  if (i >= 0) {
    lines[i] = line;
  } else {
    // Drop trailing blank lines so entries stay contiguous (no blank-line drift).
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
    lines.push(line);
  }
  writeAtomic(indexPath, lines.join("\n").replace(/\n*$/, "\n"));
}

export function removeIndexLine(indexPath: string, slug: string): void {
  if (!existsSync(indexPath)) return;
  const re = entryLineRe(slug);
  const kept = readFileSync(indexPath, "utf8").split("\n").filter((l) => !re.test(l));
  writeAtomic(indexPath, kept.join("\n").replace(/\n*$/, "\n"));
}

/**
 * File-based agent memory: a single `<home>/memory/MEMORY.md` index + per-
 * scenario `<slug>.md` files. The index is injected into systemPrompt.append;
 * scenario bodies are read on demand by the agent. Writes are serialized per
 * agent and atomic. No semantic retrieval (non-RAG — spec).
 */
export class AgentMemoryStore {
  private locks = new Map<string, Promise<unknown>>();

  constructor(private agents: Pick<AgentWorkspaceService, "homeDir">) {}

  private dir(agentId: string): string | null {
    const home = this.agents.homeDir(agentId);
    return home ? join(home, MEMORY_DIR) : null;
  }

  /** Create memory/ + an index file. Idempotent. Returns the dir or null. */
  ensure(agentId: string): string | null {
    const dir = this.dir(agentId);
    if (!dir) return null;
    mkdirSync(dir, { recursive: true });
    const idx = join(dir, MEMORY_INDEX);
    if (!existsSync(idx)) writeAtomic(idx, INDEX_HEADER);
    return dir;
  }

  /** Index text for injection ("" when none). */
  indexText(agentId: string): string {
    const dir = this.dir(agentId);
    if (!dir) return "";
    try {
      return readFileSync(join(dir, MEMORY_INDEX), "utf8");
    } catch {
      return "";
    }
  }

  async tree(agentId: string): Promise<TreeNode[]> {
    const dir = this.dir(agentId);
    if (!dir) return [];
    mkdirSync(dir, { recursive: true });
    return walkTree(dir, "", 0, { count: 0 });
  }

  save(agentId: string, input: MemorySaveInput): Promise<MemoryEditResult> {
    return this.locked(agentId, () => {
      const dir = this.ensure(agentId);
      if (!dir) return { status: "not_found" as const };
      const slug = sanitizeSlug(input.file);
      const body = input.content.endsWith("\n") ? input.content : `${input.content}\n`;
      writeAtomic(join(dir, `${slug}.md`), body);
      upsertIndexLine(join(dir, MEMORY_INDEX), slug, input.title, input.hook);
      return { status: "ok" as const, message: input.title };
    });
  }

  remove(agentId: string, file: string): Promise<MemoryEditResult> {
    return this.locked(agentId, () => {
      const dir = this.dir(agentId);
      if (!dir) return { status: "not_found" as const };
      const slug = sanitizeSlug(file);
      const fp = join(dir, `${slug}.md`);
      if (!existsSync(fp)) return { status: "not_found" as const };
      rmSync(fp);
      removeIndexLine(join(dir, MEMORY_INDEX), slug);
      return { status: "ok" as const, message: slug };
    });
  }

  /** Backstop: past `hard`, drop oldest index entries (+ their files) until the
   *  index char length ≤ `soft`. Oldest = first matching line top-down. */
  enforceIndexBudget(agentId: string): Promise<void> {
    return this.locked(agentId, () => {
      const dir = this.dir(agentId);
      if (!dir) return;
      const idxPath = join(dir, MEMORY_INDEX);
      if (!existsSync(idxPath)) return;
      // Only the host-side backstop: act ONLY past `hard`, leaving a warn→hard
      // band for the agent to self-consolidate. Once triggered, trim to `soft`.
      if (readFileSync(idxPath, "utf8").length <= MEMORY_INDEX_BUDGET.hard) return;
      while (readFileSync(idxPath, "utf8").length > MEMORY_INDEX_BUDGET.soft) {
        const lines = readFileSync(idxPath, "utf8").split("\n");
        const i = lines.findIndex((l) => /\]\(([\w.-]+)\.md\)/.test(l));
        if (i < 0) break;
        const slug = lines[i]!.match(/\]\(([\w.-]+)\.md\)/)![1]!;
        rmSync(join(dir, `${slug}.md`), { force: true });
        lines.splice(i, 1);
        writeAtomic(idxPath, lines.join("\n").replace(/\n*$/, "\n"));
      }
    });
  }

  private async locked<T>(agentId: string, fn: () => T): Promise<T> {
    const prev = this.locks.get(agentId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.locks.set(agentId, run.catch(() => {}));
    return run;
  }
}
