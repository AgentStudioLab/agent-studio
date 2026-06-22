import { Hono } from "hono";
import { cors } from "hono/cors";
import path from "node:path";
import { openDb } from "./db";
import { ensureAgentStudioHome } from "./lib/agentStudioHome";
import { createRequestLogger } from "./lib/requestLogger";
import { healthRoutes } from "./routes/health";
import { buildConversationRoutes } from "./routes/conversations";
import { buildMessageRoutes } from "./routes/messages";
import { buildSettingsRoutes } from "./routes/settings";
import { buildRunRoutes } from "./routes/runs";
import { buildAuditRoutes } from "./routes/audit";
import { buildUsageRoutes } from "./routes/usage";
import { buildModelsRoutes } from "./routes/models";
import { createProviderSettings } from "./services/providerSettings";
import { createOfficialService } from "./services/officialService";
import { createUserProfileSettings } from "./services/userProfileSettings";
import { composeAppendPrompt } from "./lib/composeAppendPrompt";
import { ThreadService } from "./services/threads";
import { MessageService } from "./services/messages";
import { generateTitle } from "./services/titleGenerator";
import { ScheduledTaskService } from "./services/scheduledTasks";
import { Scheduler } from "./services/scheduler";
import { buildScheduledRoutes } from "./routes/scheduled";
import { AgentWorkspaceService, DEFAULT_BASE_DIR } from "./services/agentWorkspaces";
import { reconcileBuiltinAgents } from "./services/builtinAgents";
import { AgentFolderService } from "./services/agentFolders";
import { AgentLinkService } from "./services/agentLinks";
import { AgentMemoryStore } from "./services/agentMemoryStore";
import { buildAgentWorkspaceRoutes } from "./routes/agentWorkspaces";
import { buildAgentFolderRoutes } from "./routes/agentFolders";
import { buildAgentLinkRoutes } from "./routes/agentLinks";
import { buildAgentInstructionRoutes } from "./routes/agentInstructions";
import { buildAgentMemoryTreeRoutes } from "./routes/agentMemory";
import { AuditService } from "./services/audit";
import { UsageService } from "./services/usage";
import { SettingsToolsService } from "./services/settings-tools";
import { buildSettingsToolsRoutes } from "./routes/settings-tools";
import { createBunSqliteRunStore } from "./agui/store-sqlite";
import type { AgentProvider } from "./agui/core";
import { createAgentProviderForRuntime } from "./agui/provider-factory";
import type { ClaudeProviderOptions } from "./agui/provider-claude";
import { createOfficialProvider } from "./agui/provider-official/official-provider";
import { createInterruptBus } from "./agui/provider-claude";
import { SessionMetadataStore } from "./services/sessionMetadata";
import { buildThreadContextRoutes } from "./routes/threadContext";
import { buildFileContentRoutes } from "./routes/fileContent";
import { SkillRegistry } from "./services/skillRegistry";
import { buildSkillsRoutes } from "./routes/skills";
import { buildSkillFilesRoutes } from "./routes/skillFiles";
import { SkillInvocationStore } from "./agui/provider-claude/skill-invocations";
import { ChannelConnectionService } from "./channels/core/ChannelConnectionService";
import { ChannelSessionService } from "./channels/core/ChannelSessionService";
import { PluginRegistry } from "./channels/core/PluginRegistry";
import { ChannelManager } from "./channels/core/ChannelManager";
import { RemoteTaskAggregator } from "./channels/tasks/RemoteTaskAggregator";
import { RemoteTaskService } from "./channels/tasks/RemoteTaskService";
import { FakeChannelPlugin } from "./channels/plugins/fake/FakeChannelPlugin";
import { WeixinPlugin } from "./channels/plugins/weixin/WeixinPlugin";
import { buildChannelConnectionRoutes } from "./channels/routes/channelConnections";
import { buildRemoteTaskRoutes } from "./channels/routes/remoteTasks";
import { runWorker } from "./agent/runWorker";
import {
  buildAgentStudioCcrConfig,
  type AgentStudioCcrConfigOptions,
  CcrManager,
  CCR_SPAWN_MANAGED,
  resolveCcrRuntimeRoute,
  withCcrReady,
} from "./ccr";

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
const officialService = createOfficialService();
const providerSettings = createProviderSettings(db, {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
}, officialService);

function parseCcrLogLevel(
  value: string | undefined,
): AgentStudioCcrConfigOptions["logLevel"] | undefined {
  if (
    value === "fatal" ||
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug" ||
    value === "trace"
  ) {
    return value;
  }
  return undefined;
}

const ccrManager = new CcrManager({
  enabled: process.env.AGENT_STUDIO_DISABLE_CCR !== "1",
  port: Number.parseInt(process.env.AGENT_STUDIO_CCR_PORT ?? "3456", 10),
  configDir: path.join(path.dirname(dbAbs), "ccr"),
  spawn: CCR_SPAWN_MANAGED,
});
const ccrConfigOptions: AgentStudioCcrConfigOptions = {
  log: process.env.AGENT_STUDIO_CCR_LOG === "1",
  logLevel: parseCcrLogLevel(process.env.AGENT_STUDIO_CCR_LOG_LEVEL),
};
const userProfileSettings = createUserProfileSettings(db);

const threads = new ThreadService(db);
const messages = new MessageService(db);
const scheduledTasks = new ScheduledTaskService(db);
const agentWorkspaces = new AgentWorkspaceService(db);
// 内置(官方只读预置)智能体：把仓库内打包的 JSON/AGENT.md reconcile 进 agent_workspaces
// （source='builtin'）+ 生成 homeDir。定义字段每次启动覆盖、用户自有数据不动。同步执行
// （bun --compile --bytecode 不支持顶层 await）。必须用与 service 一致的 DEFAULT_BASE_DIR。
reconcileBuiltinAgents(db, DEFAULT_BASE_DIR);
const agentFolders = new AgentFolderService(db);
const agentLinks = new AgentLinkService(db);
const agentMemoryStore = new AgentMemoryStore(agentWorkspaces);
const store = createBunSqliteRunStore(db);
const interruptBus = createInterruptBus({ store });
const audit = new AuditService(db);
const usage = new UsageService(db);
const settingsTools = new SettingsToolsService(db);
const sessionMetadata = new SessionMetadataStore();
const skillRegistry = new SkillRegistry(db);
const channelConnections = new ChannelConnectionService(db);
const channelSessions = new ChannelSessionService(db);
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
// 为每个 awaiting_user / 旧版 awaiting_approval 孤儿 run 补一条系统消息，让用户下次
// 打开时能看到“继续上次任务”入口。独立内容前缀会被 groupIntoTurns 解析成
// `reason: "process_restart"`，无需额外 DB 迁移。
for (const o of reconcile.awaitingOrphans) {
  try {
    messages.appendSystemNote(
      o.threadId,
      "[process_restart] 上次等待用户时应用被关闭，agent 已停止",
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

app.use(
  "*",
  createRequestLogger({
    // conversations 相关接口包含高频状态轮询和列表刷新；保留其他接口日志即可。
    skipPathPrefixes: ["/conversations"],
  }),
);

app.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${args.token}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

// Build providers lazily — one instance per resolved provider/model settings tuple.
// Sessions live inside the provider, so we cache. When provider settings change
// we invalidate the cache so the next run picks up the new endpoint/selection.
const providerInstances = new Map<string, AgentProvider>();
function providerCacheKey(selection?: { providerId: string; modelId: string } | null) {
  const resolved = providerSettings.resolveSelection(selection);
  if (resolved.providerId === "official") {
    return `${resolved.providerId}:${resolved.modelId ?? ""}:${resolved.apiKey}:${resolved.baseUrl}`;
  }
  if (resolved.customProtocol !== "openai-compatible") {
    const runtimeUrl =
      resolved.agentRuntime.protocol === "anthropic"
        ? resolved.agentRuntime.baseUrl
        : resolved.baseUrl;
    return `${resolved.providerId}:direct:${resolved.modelId ?? ""}:${resolved.agentRuntime.protocol}:${runtimeUrl}:${resolved.apiKey}`;
  }
  const route = resolveCcrRuntimeRoute(resolved, {
    baseUrl: ccrManager.baseUrl(),
  });
  return `${resolved.providerId}:${route.model}:${route.baseUrl}:${resolved.apiKey}:${resolved.baseUrl}`;
}
function buildProviderForSelection(
  selection?: { providerId: string; modelId: string } | null,
) {
  const current = providerSettings.resolveSelection(selection);
  if (current.providerId === "official") {
    return createOfficialProvider();
  }
  if (!current.apiKey) throw new Error("api_key_missing");
  const resolveAllowedTools = (threadId: string): string[] => {
    const override = threads.getAllowedTools(threadId);
    return override ?? settingsTools.getDefault();
  };

  const common: Omit<
    ClaudeProviderOptions,
    "apiKey" | "baseUrl" | "authMode" | "model"
  > = {
    resolveAllowedTools,
    interruptBus,
    audit,
    resolveAppendPrompt: () =>
      composeAppendPrompt(userProfileSettings.current()),
    onInitMetadata: (threadId, meta) => sessionMetadata.upsert(threadId, meta),
    // 全局启用集 ∩ 该 agent 的挂载选择。绑 agent 且其 mountedSkills 为数组时收窄；
    // 为 null（继承）或不绑 agent 时直接用全局启用集。全局禁用/卸载的技能因交集自然掉出。
    resolveSkillsConfig: (agentWorkspaceId) => {
      const enabled = skillRegistry.listEnabledIds();
      const mounted = agentWorkspaceId
        ? (agentWorkspaces.get(agentWorkspaceId)?.mountedSkills ?? null)
        : null;
      const effective =
        mounted == null ? enabled : enabled.filter((id) => mounted.includes(id));
      return {
        enabledSkills: effective,
        pluginPath: skillRegistry.builtinPluginPath(),
      };
    },
    skillInvocationsStore: skillInvocations,
    // `/schedule` skill → in-process MCP tool persists through the same service
    // the scheduler reads。Working dir + model are injected by the provider
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
    // `remember` MCP tool (agent-bound runs) → write that agent's file-based
    // memory. The MemoryEdit union guarantees save fields are present when
    // action === "save"; remove needs only `file`.
    onRemember: (edit, { agentWorkspaceId, threadId }) => {
      if (edit.action === "save") {
        return agentMemoryStore.save(agentWorkspaceId, {
          file: edit.file, title: edit.title, hook: edit.hook, content: edit.content,
          originThreadId: threadId, type: edit.type,
        });
      }
      return agentMemoryStore.remove(agentWorkspaceId, edit.file);
    },
  };

  if (current.customProtocol === "openai-compatible") {
    const route = resolveCcrRuntimeRoute(current, { baseUrl: ccrManager.baseUrl() });
    const ccrConfig = buildAgentStudioCcrConfig([route], ccrConfigOptions);
    const provider = createAgentProviderForRuntime({
      runtime: {
        protocol: "anthropic",
        baseUrl: route.baseUrl,
        auth: route.authMode,
        capabilities: current.agentRuntime.capabilities,
      },
      apiKey: route.apiKey,
      defaultModel: route.model,
      common,
    });
    return withCcrReady(provider, () => ccrManager.ensure(ccrConfig));
  }

  return createAgentProviderForRuntime({
    runtime: current.agentRuntime,
    apiKey: current.apiKey,
    defaultModel: current.modelId ?? undefined,
    common,
  });
}
function getProvider(selection?: { providerId: string; modelId: string } | null) {
  const key = providerCacheKey(selection);
  let provider = providerInstances.get(key);
  if (!provider) {
    provider = buildProviderForSelection(selection);
    providerInstances.set(key, provider);
  }
  return provider;
}
// Drop the cache on any provider settings change. Next /runs builds a fresh
// instance with the new baseUrl / apiKey. In-flight runs continue against
// the old instance — that's intentional, we don't yank a running session.
providerSettings.onChange(() => {
  providerInstances.clear();
});
// Lazy proxy so routes can wire it as a stable reference.
const providerProxy: AgentProvider = {
  get name() { return getProvider().name; },
  run: (ctx) => getProvider().run(ctx),
  resume: (ctx) => getProvider().resume(ctx),
  getPendingInterrupts: (tid, rid) => getProvider().getPendingInterrupts(tid, rid),
  notifyCancelled: (tid) => getProvider().notifyCancelled?.(tid) ?? Promise.resolve(),
  rewindFiles: ((input) =>
    getProvider().rewindFiles?.(input) ??
    Promise.resolve({ canRewind: false, error: "unsupported" })),
};

const channelRegistry = new PluginRegistry();
const fakeChannelPlugin = new FakeChannelPlugin();
channelRegistry.register(fakeChannelPlugin);
channelRegistry.register(new WeixinPlugin());
let channelManager: ChannelManager;
const remoteTaskService = new RemoteTaskService({
  db,
  connections: channelConnections,
  sessions: channelSessions,
  threads,
  messages,
  store,
  startRun: async (input) => {
    void runWorker({
      runId: input.runId,
      threadId: input.threadId,
      userMessage: { role: "user", content: input.prompt },
      store,
      messages,
      threads,
      agentWorkspaces,
      agentFolders,
      agentLinks,
      agentMemoryStore,
      provider: providerProxy,
      interruptBus,
      abortSignal: new AbortController().signal,
      usage,
      permissionMode: input.permissionMode,
      appendContextExtra: input.appendContextExtra,
      userMessageId: input.userMessageId,
      onTerminalResult: input.onTerminalResult,
    });
  },
  sendResult: async (input) => channelManager.sendRemoteTaskResult(input),
});
const remoteTaskAggregator = new RemoteTaskAggregator({
  sessions: channelSessions,
  tasks: remoteTaskService,
});
channelManager = new ChannelManager({
  connections: channelConnections,
  registry: channelRegistry,
  aggregator: remoteTaskAggregator,
  tasks: remoteTaskService,
});
void channelManager.recoverRemoteTasksOnBoot().catch((err) => {
  console.warn("[channels] recover remote tasks failed:", err);
});
void channelManager.startEnabled().catch((err) => {
  console.warn("[channels] start enabled connections failed:", err);
});

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
  agentWorkspaces,
  agentFolders,
  agentLinks,
  agentMemoryStore,
  resolveAgentHome: (agentWorkspaceId) => agentWorkspaces.homeDir(agentWorkspaceId),
  canRun: () => !!providerSettings.current().apiKey,
});
scheduler.start();

app.route("/", healthRoutes);
app.route("/", buildConversationRoutes({ threads, store, agentWorkspaces }));
app.route("/", buildScheduledRoutes({ tasks: scheduledTasks, threads, store, scheduler }));
app.route("/", buildAgentWorkspaceRoutes({ agentWorkspaces, threads, scheduledTasks }));
app.route("/", buildAgentFolderRoutes({ agentFolders, agentWorkspaces }));
app.route("/", buildAgentLinkRoutes({ agentLinks, agentWorkspaces }));
app.route("/", buildAgentMemoryTreeRoutes({ agentMemoryStore, agentWorkspaces }));
app.route("/", buildAgentInstructionRoutes({ agentWorkspaces }));
app.route("/", buildMessageRoutes(messages));
app.route(
  "/",
  buildSettingsRoutes(providerSettings, userProfileSettings, {
    officialService,
  }),
);
app.route(
  "/",
  buildRunRoutes({
    threads,
    messages,
    agentWorkspaces,
    agentFolders,
    agentLinks,
    agentMemoryStore,
    provider: providerProxy,
    resolveProvider: (selection) => getProvider(selection),
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
app.route(
  "/",
  buildChannelConnectionRoutes({
    connections: channelConnections,
    manager: channelManager,
    fake: fakeChannelPlugin,
  }),
);
app.route("/", buildRemoteTaskRoutes({ tasks: remoteTaskService }));
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
