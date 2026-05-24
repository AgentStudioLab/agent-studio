// Bash cwd side-effects tracker.
//
// PreToolUse(Bash) records an mtime snapshot of cwd; PostToolUse(Bash) diffs
// against it. The diff is stored keyed by tool_use_id so bridge.ts can attach
// it to the right TOOL_CALL_RESULT as a CUSTOM "file.side_effects" event.
//
// Lifecycle: one BashSideEffectsTracker per call to provider.run(). Lives on
// the closure inside runTurn; freed when the generator ends.

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { readdirSync, statSync, type Stats } from "node:fs";
import { join } from "node:path";

export interface SideEffectFile {
  path: string; // absolute path
  kind: "created" | "modified";
}

// path → mtime in epoch ms. mtime is enough to detect changes; value space
// stays compact compared to hashing content.
type Snapshot = Map<string, number>;

const SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
]);

const MAX_FILES = 5000; // Stop scanning after this many to bound cost on huge trees.

function scanCwd(root: string): Map<string, number> {
  const result = new Map<string, number>();
  function walk(dir: string) {
    if (result.size >= MAX_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import("node:fs").Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (result.size >= MAX_FILES) return;
      const name = entry.name as string;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        if (name.startsWith(".") && name.length > 1) continue;
        walk(join(dir, name));
        continue;
      }
      if (!entry.isFile()) continue;
      const full = join(dir, name);
      let s: Stats;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      result.set(full, s.mtimeMs);
    }
  }
  walk(root);
  return result;
}

/**
 * Per-run tracker for Bash tool-call cwd diffs. PreToolUse(Bash) records
 * a snapshot; PostToolUse(Bash) diffs against it. The diff is keyed by
 * tool_use_id so bridge.ts can attach it to the right TOOL_CALL_RESULT.
 *
 * Lifecycle: one tracker per call to `provider.run()`. Lives on the closure
 * inside runTurn; freed when the generator ends.
 */
export class BashSideEffectsTracker {
  private snapshots = new Map<string, Snapshot>();
  private effects = new Map<string, SideEffectFile[]>();

  snapshot(toolUseId: string, cwd: string): void {
    this.snapshots.set(toolUseId, scanCwd(cwd));
  }

  finalize(toolUseId: string, cwd: string): void {
    const prev = this.snapshots.get(toolUseId);
    this.snapshots.delete(toolUseId);
    const current = scanCwd(cwd);
    const out: SideEffectFile[] = [];
    if (!prev) {
      // No snapshot — Bash ran but Pre hook didn't fire. Skip diff (no baseline).
      this.effects.set(toolUseId, []);
      return;
    }
    for (const [path, mt] of current) {
      const before = prev.get(path);
      if (before === undefined) {
        out.push({ path, kind: "created" });
      } else if (mt > before) {
        out.push({ path, kind: "modified" });
      }
    }
    // Deletions are deliberately not reported — Files Tab is about produced/
    // modified artifacts; deletions aren't artifacts.
    this.effects.set(toolUseId, out);
  }

  /** Read and consume — returns null if no entry exists. */
  takeEffects(toolUseId: string): SideEffectFile[] | null {
    const v = this.effects.get(toolUseId);
    if (v === undefined) return null;
    this.effects.delete(toolUseId);
    return v;
  }
}

/**
 * Hook factory: returns Pre/Post hooks scoped to a single tracker. Only Bash
 * triggers a snapshot/diff — everything else returns immediately. Cwd is
 * read from the hook input, so the tracker is cwd-agnostic.
 */
export function createBashSideEffectsHooks(
  tracker: BashSideEffectsTracker,
): { pre: HookCallback; post: HookCallback } {
  const pre: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    if (input.tool_name !== "Bash") return {};
    tracker.snapshot(input.tool_use_id, input.cwd);
    return {};
  };
  const post: HookCallback = async (input) => {
    if (input.hook_event_name !== "PostToolUse") return {};
    if (input.tool_name !== "Bash") return {};
    tracker.finalize(input.tool_use_id, input.cwd);
    return {};
  };
  return { pre, post };
}
