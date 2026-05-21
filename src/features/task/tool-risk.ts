// Lightweight, syntactic risk heuristic for the approval card badge.
//
// The point of the badge is "draw the user's eye when a tool call looks
// dangerous before they fire off Enter". It is NOT a security boundary —
// the actual sandbox lives in the sidecar's canUseTool layer. So we keep
// the rules conservative (false negatives over false positives) and pattern
// based — fast, predictable, easy to extend.
//
// Levels:
//   - high:   destructive or system-path writes ("破坏性" / "系统路径")
//   - medium: anything that goes off the box ("网络访问")
//   - none:   no badge rendered
//
// Bash classification scans the raw command string for shell hot spots.
// `\b` anchors on word boundaries to avoid matching e.g. "removed" or
// "wgetuser" as flags. `dd if=`, `mkfs`, and `>/dev/` cover the classic
// "shoots foot, takes down disk" cases.

export type RiskLevel = "high" | "medium" | "none";
export interface ToolRisk {
  level: RiskLevel;
  label?: string;
}

const DANGEROUS_BASH = /\b(rm\s+-rf?|sudo|chmod\s+-R|dd\s+if=|mkfs|mv\s+\/|>\s*\/dev\/)/i;
const NETWORK_BASH = /\b(curl|wget|nc|netcat|ssh|scp|rsync)\b/i;
const SYSTEM_PATH = /^\/(etc|usr|System|bin|sbin)\b/;

export function assessToolRisk(
  toolName: string,
  input: Record<string, unknown>,
): ToolRisk {
  if (toolName === "Bash") {
    const cmd = String(input.command ?? "");
    if (DANGEROUS_BASH.test(cmd)) return { level: "high", label: "破坏性" };
    if (NETWORK_BASH.test(cmd)) return { level: "medium", label: "网络访问" };
    return { level: "none" };
  }
  if (toolName === "WebFetch" || toolName === "WebSearch") {
    return { level: "medium", label: "网络访问" };
  }
  if (toolName === "Write" || toolName === "Edit") {
    const fp = String(input.file_path ?? "");
    if (SYSTEM_PATH.test(fp)) return { level: "high", label: "系统路径" };
    return { level: "none" };
  }
  return { level: "none" };
}
