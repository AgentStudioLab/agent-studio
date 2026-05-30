// Workspace path sandbox —— UX 层，**不是**安全边界。
//
// 安全边界由 SDK 的 OS-level sandbox（macOS Seatbelt / Linux bwrap）在
// provider.ts 注入；本文件做的只是字符串路径 fast-deny，目的：
//   - 让模型拿到具体的 deny 原因（OS deny 的消息对模型不够友好）
//   - 避免不必要的 HITL 卡片闪现
//
// 当 OS sandbox 关闭（如未来加 dev mode 开关），这一层就退化为唯一防线，
// 但生产构建中 SDK sandbox 永远 enabled: true。
//
// 范围决策（不变）：
//   - Bash 不在此处沙箱。命令包含 `cd /elsewhere` 之类无法静态检测；
//     OS sandbox + HITL 双保险已足够。
//   - Web 工具 / Task 不走本地路径，pass through。

import { resolve, relative, isAbsolute, sep } from "node:path";

/**
 * Returns true if `target` resolves to a location inside `root` (including
 * exact equality). Symlinks are NOT resolved — that would require I/O at
 * gate time which would slow every tool call; the SDK's tools follow links
 * as the OS does anyway, and the user picked the workingDir.
 */
export function isPathUnder(target: string, root: string): boolean {
  const absTarget = isAbsolute(target) ? target : resolve(root, target);
  const absRoot = resolve(root);
  const rel = relative(absRoot, absTarget);
  if (rel === "") return true; // exact match
  if (rel.startsWith("..")) return false;
  // On *nix `relative` returns "" or a non-leading-".." path when target is
  // under root. Defensive: also reject absolute paths (cross-volume on win).
  return !isAbsolute(rel) && !rel.startsWith(".." + sep);
}

/** True when `target` resolves inside ANY of `roots`. */
export function isPathUnderAny(target: string, roots: string[]): boolean {
  return roots.some((r) => isPathUnder(target, r));
}

/**
 * Read/write roots for a run. For a non-agent thread both are `[cwd]`. For an
 * agent-bound thread, `read` = [home, …all external folders] and `write` =
 * [home, …writable external folders] — so read-only mounts are readable but
 * not writable (spec §5.3).
 */
export interface SandboxRoots {
  read: string[];
  write: string[];
}

/**
 * Inspect a tool invocation and return a deny reason (string) if any of its
 * filesystem-touching arguments fall outside the allowed roots. Returns null to
 * allow. Reads are checked against `roots.read`; mutations (Write/Edit/…)
 * against `roots.write`, so a write to a read-only mount is denied early at this
 * UX layer with a clear message (the OS sandbox would block it regardless). The
 * returned string is fed back to the model, so it's specific enough to adjust.
 */
export function checkWorkspaceSandbox(
  toolName: string,
  input: Record<string, unknown>,
  roots: SandboxRoots,
): string | null {
  const isMutation =
    toolName === "Write" ||
    toolName === "Edit" ||
    toolName === "MultiEdit" ||
    toolName === "NotebookEdit";

  // Tools that take a single `file_path` (string) argument.
  if (toolName === "Read" || isMutation) {
    const fp = input.file_path;
    if (typeof fp !== "string") return null;
    if (isMutation) {
      if (!isPathUnderAny(fp, roots.write)) {
        return `Path ${fp} is not in a writable directory (${roots.write.join(", ")}). External folders mounted into this agent are read-only unless write access is granted.`;
      }
      return null;
    }
    if (!isPathUnderAny(fp, roots.read)) {
      return `Path ${fp} is outside this conversation's accessible directories (${roots.read.join(", ")}).`;
    }
    return null;
  }

  // Tools whose `path` argument optionally narrows a search root.
  if (toolName === "Glob" || toolName === "Grep") {
    const p = input.path;
    if (typeof p !== "string") return null; // optional → defaults to cwd
    if (!isPathUnderAny(p, roots.read)) {
      return `Search root ${p} is outside this conversation's accessible directories (${roots.read.join(", ")}).`;
    }
    return null;
  }

  return null;
}
