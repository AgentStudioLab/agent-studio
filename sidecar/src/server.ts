import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import { openDb } from "./db";
import { healthRoutes } from "./routes/health";
import { buildConversationRoutes } from "./routes/conversations";
import { buildMessageRoutes } from "./routes/messages";
import { buildSettingsRoutes } from "./routes/settings";
import { buildRunRoutes } from "./routes/runs";
import { buildAuditRoutes } from "./routes/audit";
import { buildUsageRoutes } from "./routes/usage";
import { createApiKeyState } from "./services/apiKey";
import { ThreadService } from "./services/threads";
import { MessageService } from "./services/messages";
import { AuditService } from "./services/audit";
import { UsageService } from "./services/usage";
import { SettingsToolsService } from "./services/settings-tools";
import { buildSettingsToolsRoutes } from "./routes/settings-tools";
import { createBunSqliteRunStore } from "./agui/store-sqlite";
import {
  createClaudeProvider,
  createInterruptBus,
} from "./agui/provider-claude";

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

const dbAbs = path.resolve(args.db);
if (!dbAbs.endsWith(".db")) {
  console.error(`refusing non-.db path: ${dbAbs}`);
  process.exit(2);
}

const db = openDb(dbAbs);
const apiKey = createApiKeyState(process.env.ANTHROPIC_API_KEY);

const threads = new ThreadService(db);
const messages = new MessageService(db);
const store = createBunSqliteRunStore(db);
const interruptBus = createInterruptBus({ store });
const audit = new AuditService(db);
const usage = new UsageService(db);
const settingsTools = new SettingsToolsService(db);

// Mark orphan running rows (process crashed mid-stream) as error so the
// sidebar pulse dot doesn't lie. Synchronous SQL UPDATE — must stay sync
// because `bun build --compile --bytecode` does not support top-level await.
const reconcile = store.reconcileOrphans();
// For each awaiting_approval orphan, drop a system note so the user sees a
// "继续上次任务" affordance on next reload. The note's distinct content prefix
// is how groupIntoTurns assigns `reason: "process_restart"` to the notice
// block — no DB migration needed.
for (const o of reconcile.awaitingOrphans) {
  try {
    messages.appendSystemNote(
      o.threadId,
      "[process_restart] 上次审批未完成时应用被关闭，agent 已停止",
    );
  } catch (err) {
    console.warn("[boot] failed to append process_restart note", o, err);
  }
}
const totalOrphans = reconcile.runningCount + reconcile.awaitingOrphans.length;
if (totalOrphans > 0) {
  console.log(
    `[boot] reconciled ${reconcile.runningCount} running + ${reconcile.awaitingOrphans.length} awaiting orphan(s)`,
  );
}

export const app = new Hono();

// CORS must run before auth — preflight OPTIONS sends no Authorization,
// auth would 401 it and the browser drops the real request.
app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

// Build provider lazily on each /ag-ui/run? No — single instance is fine
// (sessions are tracked inside). Throws if no API key by the time first run hits.
function buildProvider() {
  const key = apiKey.get();
  if (!key) throw new Error("api_key_missing");
  const resolveAllowedTools = (threadId: string): string[] => {
    const override = threads.getAllowedTools(threadId);
    return override ?? settingsTools.getDefault();
  };
  return createClaudeProvider({
    apiKey: key,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL,
    resolveAllowedTools,
    interruptBus,
    audit,
  });
}

// Build once at boot — sessionByThread map lives across requests.
// If api key is missing, defer creation: build on first run() and store.
let providerInstance: ReturnType<typeof createClaudeProvider> | null = null;
function getProvider() {
  if (!providerInstance) providerInstance = buildProvider();
  return providerInstance;
}
// Lazy proxy so routes can wire it as a stable reference.
const providerProxy = {
  get name() { return "claude-agent-sdk"; },
  run: ((ctx) => getProvider().run(ctx)) as ReturnType<typeof createClaudeProvider>["run"],
  resume: ((ctx) => getProvider().resume(ctx)) as ReturnType<typeof createClaudeProvider>["resume"],
  getPendingInterrupts: ((tid, rid) => getProvider().getPendingInterrupts(tid, rid)) as ReturnType<typeof createClaudeProvider>["getPendingInterrupts"],
  notifyCancelled: ((tid) => getProvider().notifyCancelled?.(tid) ?? Promise.resolve()) as ReturnType<typeof createClaudeProvider>["notifyCancelled"],
};

app.route("/", healthRoutes);
app.route("/", buildConversationRoutes({ threads, store }));
app.route("/", buildMessageRoutes(messages));
app.route("/", buildSettingsRoutes(apiKey));
app.route(
  "/",
  buildRunRoutes({
    threads,
    messages,
    provider: providerProxy,
    store,
    interruptBus,
    usage,
  }),
);
app.route("/", buildAuditRoutes(audit));
app.route("/", buildUsageRoutes(usage));
app.route("/", buildSettingsToolsRoutes(settingsTools));

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
