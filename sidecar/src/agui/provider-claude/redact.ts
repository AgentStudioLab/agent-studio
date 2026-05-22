// 工具入参 / 命令字符串中的敏感值打码。
//
// 用于 tool_audit 写入前清理 input_json，避免 API key / token / 密码
// 落到合规审计表里（审计表是 append-only 不可改，写进去就回不来）。
//
// 策略：
//   - 对象字段名匹配 SECRET_KEYS（api_key / access_key / private_key /
//     token / bearer / password / secret / authorization / cookie，
//     带 word-boundary 防止 secretary_email 之类误匹配）
//     → 整个 value 替换为 "***"
//   - 字符串值中匹配「= 或 : 或空白 后接 20+ 字母数字/横线/下划线」→ 该段
//     替换为 "***"。这会触发误匹配（git SHA / UUID 在带前缀的位置会被打码），
//     接受这个 noise 换取「不漏写 secret 到 append-only 审计表」的安全余量。
//   - 数字 / 布尔 / null 原样返回

const SECRET_KEYS = /(^|_|-)(api[_-]?key|access[_-]?key|private[_-]?key|token|bearer|password|passwd|secret|authorization|cookie)(?!_policy)([_-]|$)/i;
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
