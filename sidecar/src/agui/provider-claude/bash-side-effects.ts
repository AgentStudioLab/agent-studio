// Bash cwd side-effects tracker.
//
// PreToolUse(Bash) writes a sentinel file in tmpdir and records its mtimeMs;
// PostToolUse(Bash) walks cwd once, statting each file, and keeps the ones
// whose mtimeMs > sentinelMtimeMs. created vs modified is inferred from
// birthtimeMs (>= sentinelMtimeMs → created; otherwise → modified).
//
// This replaces the previous "double-scan + Map<path, mtimeMs> diff" approach,
// which had three problems:
//   1) 2N stat syscalls per Bash call (one full scan in Pre, another in Post).
//   2) MAX_FILES = 5000 hard cap silently dropped new files in big repos.
//   3) Pre scanned the SDK-provided cwd, so `cd subdir && cmd` style commands
//      that altered the working directory escaped detection.
//
// The new approach: zero work in Pre except a single writeFile; the Post-only
// walk reuses the existing recursion shape with mtime-vs-sentinel filtering.

import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { readdirSync, statSync, writeFileSync, unlinkSync, type Stats } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface SideEffectFile {
  path: string; // absolute path
  kind: "created" | "modified";
}

interface Snapshot {
  sentinelPath: string;
  sentinelMtimeMs: number;
  cwd: string;
}

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

// File-name patterns to drop unconditionally. Editor swap files (~ / .swp),
// platform droppings (.DS_Store / Thumbs.db), and ubiquitous build noise
// (*.pyc / *.log) — none of which the user wants surfaced in the Files Tab.
const DENY_NAME_REGEX = /^\.DS_Store$|^Thumbs\.db$|\.pyc$|\.log$|\.swp$|~$/;

function shouldSkipDir(name: string): boolean {
  if (SKIP_DIRS.has(name)) return true;
  // Hidden directories — preserve the previous policy. ".git" etc fall through
  // SKIP_DIRS first; anything else starting with "." (e.g. ".idea", ".vscode")
  // is also pruned to avoid IDE/editor noise.
  if (name.startsWith(".") && name.length > 1) return true;
  return false;
}

/**
 * Walk `root`, stat each file once, return those whose mtime is strictly
 * after `sentinelMs`. Pure node:fs — no subprocess, cross-platform consistent.
 *
 * birthtime is read from the same Stats object the mtime check used (no extra
 * syscall). On filesystems without birthtime support, Node returns 0 / epoch
 * for birthtimeMs; we fall back to "modified" in that case rather than over-
 * reporting "created".
 */
function walkForChanges(root: string, sentinelMs: number): SideEffectFile[] {
  const out: SideEffectFile[] = [];
  function walk(dir: string): void {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import("node:fs").Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name as string;
      if (entry.isDirectory()) {
        if (shouldSkipDir(name)) continue;
        walk(join(dir, name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (DENY_NAME_REGEX.test(name)) continue;
      const full = join(dir, name);
      let s: Stats;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      // `>=` rather than `>` — fs mtime precision is ms on most platforms,
      // and the sentinel + subsequent file write can land in the same tick.
      // Using `>` would silently drop those files. The lower bound includes
      // the sentinel mtime itself, but the sentinel lives in tmpdir, not cwd,
      // so it never surfaces in the walk.
      if (s.mtimeMs < sentinelMs) continue;
      const isCreated = s.birthtimeMs > 0 && s.birthtimeMs >= sentinelMs;
      out.push({ path: full, kind: isCreated ? "created" : "modified" });
    }
  }
  walk(root);
  return out;
}

/**
 * Per-run tracker for Bash tool-call cwd diffs. PreToolUse(Bash) writes a
 * sentinel file (timestamp anchor) to tmpdir; PostToolUse(Bash) walks cwd
 * once, picks files with mtimeMs > sentinelMtimeMs, classifies created vs
 * modified by birthtimeMs. The diff is keyed by tool_use_id so bridge.ts
 * can attach it to the right TOOL_CALL_RESULT.
 *
 * Lifecycle: one tracker per call to `provider.run()`. Lives on the closure
 * inside runTurn; freed when the generator ends.
 */
export class BashSideEffectsTracker {
  private snapshots = new Map<string, Snapshot>();
  private effects = new Map<string, SideEffectFile[]>();

  snapshot(toolUseId: string, cwd: string): void {
    // Sentinel path is keyed by toolUseId to avoid collisions across
    // concurrent Bash calls within the same run.
    const sentinelPath = join(tmpdir(), `agent-studio-${toolUseId}.sentinel`);
    try {
      writeFileSync(sentinelPath, "");
      const s = statSync(sentinelPath);
      this.snapshots.set(toolUseId, {
        sentinelPath,
        sentinelMtimeMs: s.mtimeMs,
        cwd,
      });
    } catch {
      // tmpdir write failure — no snapshot recorded; finalize() will treat
      // this call as "no baseline" and produce an empty effects list.
    }
  }

  finalize(toolUseId: string, _cwd: string): void {
    const snap = this.snapshots.get(toolUseId);
    this.snapshots.delete(toolUseId);
    if (!snap) {
      this.effects.set(toolUseId, []);
      return;
    }
    // Use the cwd captured at Pre time. Even if the Bash command did
    // `cd subdir`, the file ultimately landed somewhere under (or outside)
    // the SDK-provided cwd we recorded; walking from the recorded root keeps
    // detection consistent with downstream cwdPrefix filtering.
    const changes = walkForChanges(snap.cwd, snap.sentinelMtimeMs);
    this.effects.set(toolUseId, changes);
    try {
      unlinkSync(snap.sentinelPath);
    } catch {
      // Best-effort cleanup; leftover sentinel files in tmpdir are harmless
      // (OS sweeps tmpdir periodically) and we don't want to fail the hook.
    }
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
