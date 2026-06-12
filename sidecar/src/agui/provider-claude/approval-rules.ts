// Claude Code 风格的命令模式审批规则匹配。
//
// 规则用 CC 的 `Tool(pattern)` 字符串语法表示，存为 string[]：
//   · 裸名 `Bash`（或 `Bash(*)`）  → 整个工具放行（向后兼容旧的「按工具名」allowlist）
//   · `Bash(<exact>)`              → 精确匹配整条命令
//   · `Bash(<prefix>:*)`           → 子命令前缀匹配（本仓库「卡片三选一」生成的形式）
//   · `Bash(<prefix>*)`            → 尾部通配前缀（兼容手写 / CC 导出的规则）
//
// 命令级 pattern 仅对 Bash 有意义；其它工具本期只用裸名（= 整工具）。匹配发生在
// sidecar 的 canUseTool 内（B2 方案：保留 ask:["Bash(*)"] 兜底，命中规则才不进 bus）。

export interface ParsedRule {
  tool: string;
  /** null = 裸名（整工具）；否则为括号内的 pattern 原文。 */
  pattern: string | null;
}

/**
 * 解析 `Tool` 或 `Tool(pattern)`。pattern 内允许任意字符（命令含括号/空格），
 * 用贪婪到最后一个 `)` 的方式截取。无法解析 → null（调用方按"不匹配"处理）。
 */
export function parseRule(rule: string): ParsedRule | null {
  const trimmed = rule.trim();
  if (!trimmed) return null;
  // 形如 Tool(...) ：工具名 + 第一个 "(" 到最后一个 ")" 之间的内容。
  const open = trimmed.indexOf("(");
  if (open === -1) {
    // 裸名：必须是合法标识符（避免把命令片段误当工具名）。
    return /^[A-Za-z][A-Za-z0-9_]*$/.test(trimmed)
      ? { tool: trimmed, pattern: null }
      : null;
  }
  if (!trimmed.endsWith(")")) return null;
  const tool = trimmed.slice(0, open);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tool)) return null;
  const pattern = trimmed.slice(open + 1, -1);
  return { tool, pattern };
}

/** 取 Bash 调用的命令字符串（trim 后）。 */
function commandOf(input: Record<string, unknown>): string {
  return typeof input.command === "string" ? input.command.trim() : "";
}

/** 单条规则是否匹配本次工具调用。 */
export function matchApprovalRule(
  rule: string,
  toolName: string,
  input: Record<string, unknown>,
): boolean {
  const parsed = parseRule(rule);
  if (!parsed) return false;
  if (parsed.tool !== toolName) return false;
  // 裸名 / `(*)` → 整工具放行。
  if (parsed.pattern === null || parsed.pattern === "*") return true;
  // 命令级 pattern 仅 Bash 支持；其它工具带 pattern 的规则本期一律不匹配。
  if (toolName !== "Bash") return false;

  const cmd = commandOf(input);
  const pat = parsed.pattern.trim();
  // 退化的空 pattern（如 Bash() / Bash(  )）一律不匹配 —— 防御：避免误生成的
  // 规则放行任意（或空）命令。
  if (pat === "") return false;

  // 前缀语义：`<prefix>:*`（本仓库 UI 生成）与尾部 `<prefix>*`（兼容手写 / CC
  // 导出）都按"子命令前缀 + 词边界"匹配 —— 命令等于前缀，或以「前缀 + 空格」开头。
  // 强制词边界，避免 Bash(git*) 误中 gitfoo。空前缀（Bash(:*)/Bash(*) 之外的退化形）
  // 也不匹配。
  let prefix: string | null = null;
  if (pat.endsWith(":*")) prefix = pat.slice(0, -2).trim();
  else if (pat.endsWith("*")) prefix = pat.slice(0, -1).trimEnd();
  if (prefix !== null) {
    if (prefix === "") return false;
    return cmd === prefix || cmd.startsWith(prefix + " ");
  }
  // 否则精确匹配整条命令。
  return cmd === pat;
}

/** 任一规则匹配即放行。 */
export function anyRuleMatches(
  rules: Iterable<string>,
  toolName: string,
  input: Record<string, unknown>,
): boolean {
  for (const r of rules) {
    if (matchApprovalRule(r, toolName, input)) return true;
  }
  return false;
}
