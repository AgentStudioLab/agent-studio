// 「始终允许」三档授权 → Claude Code 风格的 `Tool(pattern)` 规则串生成。
//
// 与 sidecar 的匹配器（sidecar/src/agui/provider-claude/approval-rules.ts）成对：
// 这里只负责"生成"规则串，匹配在 sidecar 的 canUseTool 内完成（B2 方案）。
//
//   · exact  → "Bash(<命令原文>)"  （仅完全相同的命令）
//   · prefix → "Bash(<前缀>:*)"    （子命令前缀，命令或「前缀 + 空格」开头）
//
// 刻意不提供「整个 Bash（Bash(*) 一键放行所有命令）」—— 那会退回到全有全无、
// 失去命令级审批的意义。Bash 始终走命令模式规则。

export type BashRuleScope = "exact" | "prefix";

/**
 * 计算「子命令前缀」：取命令的前导 token，直到首个「以 `-` 开头（flag）」或
 * 「含 `/`（路径）」的 token 为止。例：
 *   "git status --short"  → "git status"
 *   "npm run test"        → "npm run test"
 *   "rg -n foo"           → "rg"
 *   "cat /etc/hosts"      → "cat"
 * 全是 flag/路径的极端情况退化为首个 token。卡片会展示算出的前缀，用户所见即所授。
 */
export function bashRulePrefix(command: string): string {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    if (tok.startsWith("-") || tok.includes("/")) break;
    out.push(tok);
  }
  if (out.length === 0 && tokens.length > 0) out.push(tokens[0]!);
  return out.join(" ");
}

/** 按粒度生成命令规则串（精确 / 前缀）。 */
export function buildBashRule(command: string, scope: BashRuleScope): string {
  const cmd = command.trim();
  if (scope === "exact") return `Bash(${cmd})`;
  return `Bash(${bashRulePrefix(cmd)}:*)`;
}
