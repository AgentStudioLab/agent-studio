import { Hono } from "hono";
import path from "node:path";
import { openDb } from "./db";
import { healthRoutes } from "./routes/health";
import { buildConversationRoutes } from "./routes/conversations";
import { buildSettingsRoutes } from "./routes/settings";
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

app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${args.token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.route("/", healthRoutes);
app.route("/", buildConversationRoutes(db));
app.route("/", buildSettingsRoutes(apiKey));

console.log(`[sidecar] listening on http://127.0.0.1:${args.port} (db=${dbAbs})`);

export default {
  port: args.port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
