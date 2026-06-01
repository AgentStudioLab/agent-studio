import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import { openDb } from "./db";
import { ensureAgentStudioHome } from "./lib/agentStudioHome";
import { healthRoutes } from "./routes/health";
import { buildConversationRoutes } from "./routes/conversations";
import { buildMessageRoutes } from "./routes/messages";
import { buildSettingsRoutes } from "./routes/settings";
import { buildRunRoutes } from "./routes/runs";
import { buildAuditRoutes } from "./routes/audit";
import { buildUsageRoutes } from "./routes/usage";
import { buildModelsRoutes } from "./routes/models";
import { createProviderSettings } from "./services/providerSettings";
import { createUserProfileSettings } from "./services/userProfileSettings";
import { composeAppendPrompt } from "./lib/composeAppendPrompt";
import { ThreadService } from "./services/threads";
import { MessageService } from "./services/messages";
import { generateTitle } from "./services/titleGenerator";
import { ScheduledTaskService } from "./services/scheduledTasks";
import { Scheduler } from "./services/scheduler";
import { buildScheduledRoutes } from "./routes/scheduled";
import { AgentWorkspaceService } from "./services/agentWorkspaces";
import { AgentFolderService } from "./services/agentFolders";
import { AgentMemoryService } from "./services/agentMemories";
import { AgentMemoryStore } from "./services/agentMemoryStore";
import { buildAgentWorkspaceRoutes } from "./routes/agentWorkspaces";
import { buildAgentFolderRoutes } from "./routes/agentFolders";
import { buildAgentMemoryRoutes } from "./routes/agentMemories";
import { buildAgentInstructionRoutes } from "./routes/agentInstructions";
import { AuditService } from "./services/audit";
import { UsageService } from "./services/usage";
import { SettingsToolsService } from "./services/settings-tools";
import { buildSettingsToolsRoutes } from "./routes/settings-tools";
import { createBunSqliteRunStore } from "./agui/store-sqlite";
import {
  createClaudeProvider,
  createInterruptBus,
} from "./agui/provider-claude";
import { SessionMetadataStore } from "./services/sessionMetadata";
import { buildThreadContextRoutes } from "./routes/threadContext";
import { buildFileContentRoutes } from "./routes/fileContent";
import { SkillRegistry } from "./services/skillRegistry";
import { buildSkillsRoutes } from "./routes/skills";
import { buildSkillFilesRoutes } from "./routes/skillFiles";
import { SkillInvocationStore } from "./agui/provider-claude/skill-invocations";

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

// Create ~/.agent-studio/{workspace,skills} once on boot so the user sees
// where to drop personal skills and the default cwd is ready before any
// thread starts. Idempotent — mkdir recursive swallows EEXIST.
ensureAgentStudioHome();

const db = openDb(dbAbs);
// Provider state is DB-backed. Env vars only seed the very first boot
// (when the settings row doesn't exist yet) — after the user saves once,
// the DB row wins. Lets a single binary serve different keys/baseUrls
// across machines without env juggling.
const providerSettings = createProviderSettings(db, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
});
const userProfileSettings = createUserProfileSettings(db);

const threads = new ThreadService(db);
const messages = new MessageService(db);
const scheduledTasks = new ScheduledTaskService(db);
const agentWorkspaces = new AgentWorkspaceService(db);
const agentFolders = new AgentFolderService(db);
const agentMemories = new AgentMemoryService(db);
const agentMemoryStore = new AgentMemoryStore(agentWorkspaces);
const store = createBunSqliteRunStore(db);
const interruptBus = createInterruptBus({ store });
const audit = new AuditService(db);
const usage = new UsageService(db);
const settingsTools = new SettingsToolsService(db);
const sessionMetadata = new SessionMetadataStore();
const skillRegistry = new SkillRegistry(db);
// Tracks which skills the agent invoked at runtime via the built-in `Skill`
// tool, keyed by threadId. Populated by a PreToolUse hook installed inside
// runTurn; read back by GET /threads/:id/context. In-memory — cleared on
// sidecar restart, same lifetime as SessionMetadataStore above.
const skillInvocations = new SkillInvocationStore();
// Scan ~/.agent-studio/skills, ~/.claude/skills, and the built-in plugin's
// skills/ once at boot. Re-scan requires a sidecar restart — Cowork is the
// same. Frontend GET /skills reads from this in-memory registry.
skillRegistry.init();

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

// Build provider lazily — single instance per (apiKey, baseUrl) tuple.
// Sessions live inside the provider, so we cache. When the user changes
// provider config via /settings/provider, providerSettings.onChange fires
// and we invalidate the cache so the next run picks up the new endpoint.
function buildProvider() {
  const current = providerSettings.current();
  if (!current.apiKey) throw new Error("api_key_missing");
  const resolveAllowedTools = (threadId: string): string[] => {
    const override = threads.getAllowedTools(threadId);
    return override ?? settingsTools.getDefault();
  };
  return createClaudeProvider({
    apiKey: current.apiKey,
    baseUrl: current.baseUrl || undefined,
    model: process.env.ANTHROPIC_MODEL,
    resolveAllowedTools,
    interruptBus,
    audit,
    resolveAppendPrompt: () =>
      composeAppendPrompt(userProfileSettings.current()),
    onInitMetadata: (threadId, meta) => sessionMetadata.upsert(threadId, meta),
    resolveSkillsConfig: () => ({
      enabledSkills: skillRegistry.listEnabledIds(),
      pluginPath: skillRegistry.builtinPluginPath(),
    }),
    skillInvocationsStore: skillInvocations,
    // `/schedule` skill → in-process MCP tool persists through the same service
    // the scheduler reads. Working dir + model are injected by the provider
    // from the live run; the agent only supplies name/prompt/cadence.
    onCreateScheduledTask: (input) => {
      const task = scheduledTasks.create({
        name: input.name,
        description: input.description ?? "",
        prompt: input.prompt,
        frequency: input.frequency,
        timeOfDay: input.timeOfDay ?? null,
        weekday: input.weekday ?? null,
        workingDir: input.workingDir ?? null,
        model: input.model ?? null,
        permissionMode: "ask",
      });
      return { id: task.id, name: task.name };
    },
    // `remember` MCP tool (agent-bound runs) → mutate that agent's memory.
    // The tool validates content/match presence before calling, so the
    // non-null assertions here are guaranteed by its contract.
    onRemember: (edit, { agentWorkspaceId }) => {
      if (edit.action === "save") {
        return agentMemoryStore.save(agentWorkspaceId, {
          file: edit.file, title: edit.title, hook: edit.hook, content: edit.content,
        });
      }
      return agentMemoryStore.remove(agentWorkspaceId, edit.file);
    },
  });
}

let providerInstance: ReturnType<typeof createClaudeProvider> | null = null;
function getProvider() {
  if (!providerInstance) providerInstance = buildProvider();
  return providerInstance;
}
// Drop the cache on any provider settings change. Next /runs builds a fresh
// instance with the new baseUrl / apiKey. In-flight runs continue against
// the old instance — that's intentional, we don't yank a running session.
providerSettings.onChange(() => {
  providerInstance = null;
});
// Lazy proxy so routes can wire it as a stable reference.
const providerProxy = {
  get name() { return "claude-agent-sdk"; },
  run: ((ctx) => getProvider().run(ctx)) as ReturnType<typeof createClaudeProvider>["run"],
  resume: ((ctx) => getProvider().resume(ctx)) as ReturnType<typeof createClaudeProvider>["resume"],
  getPendingInterrupts: ((tid, rid) => getProvider().getPendingInterrupts(tid, rid)) as ReturnType<typeof createClaudeProvider>["getPendingInterrupts"],
  notifyCancelled: ((tid) => getProvider().notifyCancelled?.(tid) ?? Promise.resolve()) as ReturnType<typeof createClaudeProvider>["notifyCancelled"],
  rewindFiles: ((input) =>
    getProvider().rewindFiles?.(input) ??
    Promise.resolve({ canRewind: false, error: "unsupported" })) as ReturnType<typeof createClaudeProvider>["rewindFiles"],
};

// Scheduled-task engine. Polls scheduled_tasks.next_run_at every minute and
// fires due tasks as fresh headless runs through the same runWorker path as
// POST /runs. Only ticks while this process is alive (desktop app open).
const scheduler = new Scheduler({
  tasks: scheduledTasks,
  threads,
  messages,
  store,
  provider: providerProxy,
  interruptBus,
  usage,
  agentFolders,
  agentMemories,
  resolveAgentHome: (agentWorkspaceId) => agentWorkspaces.homeDir(agentWorkspaceId),
  canRun: () => !!providerSettings.current().apiKey,
});
scheduler.start();

app.route("/", healthRoutes);
app.route("/", buildConversationRoutes({ threads, store, agentWorkspaces }));
app.route("/", buildScheduledRoutes({ tasks: scheduledTasks, threads, store, scheduler }));
app.route("/", buildAgentWorkspaceRoutes({ agentWorkspaces, threads, scheduledTasks }));
app.route("/", buildAgentFolderRoutes({ agentFolders, agentWorkspaces }));
app.route("/", buildAgentMemoryRoutes({ agentMemories, agentWorkspaces }));
app.route("/", buildAgentInstructionRoutes({ agentWorkspaces }));
app.route("/", buildMessageRoutes(messages));
app.route("/", buildSettingsRoutes(providerSettings, userProfileSettings));
app.route(
  "/",
  buildRunRoutes({
    threads,
    messages,
    agentFolders,
    agentMemories,
    provider: providerProxy,
    store,
    interruptBus,
    usage,
    // First user message → summarize into a title, replacing "New task".
    // Fire-and-forget; uses the conversation's model and never throws into
    // the run path.
    onFirstUserMessage: ({ threadId, prompt, model }) => {
      const settings = providerSettings.current();
      const titleModel = model ?? process.env.ANTHROPIC_MODEL;
      if (!settings.apiKey || !titleModel) {
        console.warn(
          `[autoTitle] skip ${threadId}: apiKey=${!!settings.apiKey} model=${titleModel ?? "—"}`,
        );
        return;
      }
      console.log(`[autoTitle] generating for ${threadId} (model=${titleModel})`);
      void generateTitle(prompt, {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || undefined,
        model: titleModel,
      })
        .then((title) => {
          if (title) {
            threads.rename(threadId, title);
            console.log(`[autoTitle] ${threadId} → "${title}"`);
          }
        })
        .catch((err) => console.warn("[autoTitle] error:", err));
    },
  }),
);
app.route("/", buildAuditRoutes(audit));
app.route("/", buildUsageRoutes(usage));
app.route("/", buildSettingsToolsRoutes(settingsTools));
app.route("/", buildModelsRoutes(providerSettings));
app.route("/", buildThreadContextRoutes(sessionMetadata, skillInvocations, skillRegistry));
app.route("/", buildFileContentRoutes());
app.route("/", buildSkillsRoutes(skillRegistry));
app.route("/", buildSkillFilesRoutes(skillRegistry));

console.log(`[sidecar] listening on http://127.0.0.1:${args.port} (db=${dbAbs})`);
{
  const cur = providerSettings.current();
  console.log(
    `[sidecar] provider: profile=${cur.profileId} baseUrl=${cur.baseUrl || "(default)"} ` +
      `apiKey=${cur.apiKey ? "yes" : "NO"} models=${cur.models.length}`,
  );
}

export default {
  port: args.port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
