import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import { openDb } from "./db";
import { healthRoutes } from "./routes/health";
import { buildConversationRoutes } from "./routes/conversations";
import { buildSettingsRoutes } from "./routes/settings";
import { buildMessageRoutes } from "./routes/messages";
import { createApiKeyState } from "./services/apiKey";

type Args = { port: number; token: string; db: string };

function parseArgs(argv: string[]): Args {
  const get = (key: string) => {
    const prefix = `--${key}=`;
    const hit = argv.find((a) => a.startsWith(prefix));
    return hit?.slice(prefix.length);
  };
  const portStr = get("port");
  const token = get("token");
  const dbArg = get("db");
  if (!portStr || !token || !dbArg) {
    console.error("usage: server --port=<n> --token=<s> --db=<path>");
    process.exit(2);
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`invalid port: ${portStr}`);
    process.exit(2);
  }
  return { port, token, db: dbArg };
}

const args = parseArgs(process.argv.slice(2));

// 路径白名单校验：db 必须在父级允许目录内（防 --db=../../etc/foo.db）。
// 这里只做基础规则：必须以 .db 结尾且 resolved。
const dbAbs = path.resolve(args.db);
if (!dbAbs.endsWith(".db")) {
  console.error(`refusing non-.db path: ${dbAbs}`);
  process.exit(2);
}

const db = openDb(dbAbs);
const apiKey = createApiKeyState(process.env.ANTHROPIC_API_KEY);

export const app = new Hono();

// CORS 必须在 auth 之前 —— 否则 WKWebView 的 preflight OPTIONS
// （因为我们发自定义 Authorization header）会被 auth middleware 401，
// 浏览器拿不到 Access-Control-Allow-* 响应头就拒绝后续真正请求。
// sidecar 只 listen 127.0.0.1 + Bearer token 校验，origin 放开是安全的。
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);

app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${args.token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.route("/", healthRoutes);
app.route("/", buildConversationRoutes(db));
app.route("/", buildMessageRoutes(db, apiKey));
app.route("/", buildSettingsRoutes(apiKey));

console.log(`[sidecar] listening on http://127.0.0.1:${args.port} (db=${dbAbs})`);
console.log(
  `[sidecar] env presence: ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? "yes" : "NO"} ` +
    `ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL ?? "NO"} ` +
    `ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL ?? "NO"}`,
);

export default {
  port: args.port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
