// 工具入参 / 命令字符串中的敏感值打码。
//
// 用于 tool_audit 写入前清理 input_json，避免 API key / token / 密码
// 落到合规审计表里（审计表是 append-only 不可改，写进去就回不来）。
//
// 策略：
//   - 对象字段名匹配 SECRET_KEYS（api_key/token/password/secret/authorization）
//     → 整个 value 替换为 "***"
//   - 字符串值中匹配 `(=|:)<空白>?<20+ 字符的字母数字横线下划线>` → 该匹配段
//     替换为 "***"
//   - 数字 / 布尔 / null 原样返回

const SECRET_KEYS = /(api[_-]?key|token|password|secret|authorization)/i;
const SECRET_VALUE = /(?<=[=:\s])([A-Za-z0-9_\-]{20,})/g;

export function redactSecrets(input: unknown): unknown {
  if (typeof input === "string") return input.replace(SECRET_VALUE, "***");
  if (Array.isArray(input)) return input.map(redactSecrets);
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? "***" : redactSecrets(v),
      ]),
    );
  }
  return input;
}
