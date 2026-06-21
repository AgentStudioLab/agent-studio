import { EventType } from "@ag-ui/core";
import { createClaudeProvider } from "../src/agui/provider-claude/provider";
import type { AGUIEvent } from "../src/agui/core/types";
import {
  buildCcrSmokeInputFromEnv,
  buildCcrSmokePlan,
  createEmptyCcrSmokeSummary,
  validateCcrSmokeInput,
  type CcrSmokeSummary,
} from "../src/ccr/smoke";
import { CcrManager } from "../src/ccr/manager";
import { spawnManagedCcr } from "../src/ccr/spawn";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function printJson(label: string, value: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(value, null, 2));
}

function collectEvent(summary: CcrSmokeSummary, event: AGUIEvent): void {
  // 只聚合事件类型和文本 delta；不要打印完整事件流，避免未来工具调用
  // 参数或错误体中带出敏感信息。
  summary.totalEvents += 1;
  const type = String(event.type);
  summary.eventTypes[type] = (summary.eventTypes[type] ?? 0) + 1;

  if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
    const delta = (event as { delta?: unknown }).delta;
    if (typeof delta === "string") summary.text += delta;
  }
}

async function waitForCcr(baseUrl: string): Promise<void> {
  // CCR 没有专门的 ready API；这里用根路径做轻量探活，避免在 router
  // 还没监听端口时就启动 Claude SDK 请求。
  const deadline = Date.now() + 10_000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return;
    } catch (err) {
      lastError = err;
    }
    await Bun.sleep(250);
  }
  throw new Error(
    `ccr_smoke_router_not_ready:${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function main(): Promise<void> {
  const input = buildCcrSmokeInputFromEnv(process.env);
  const missing = validateCcrSmokeInput(input);

  if (missing.length > 0) {
    console.error("缺少 CCR PoC 必填环境变量：");
    for (const name of missing) console.error(`- ${name}`);
    console.error("");
    console.error("最小示例：");
    console.error("AGENT_STUDIO_CCR_POC_BASE_URL=https://api.openai.com/v1 \\");
    console.error("AGENT_STUDIO_CCR_POC_API_KEY=... \\");
    console.error("AGENT_STUDIO_CCR_POC_MODEL=gpt-5.1 \\");
    console.error("bun run scripts/ccr-runtime-smoke.ts --dry-run");
    process.exitCode = 2;
    return;
  }

  const plan = buildCcrSmokePlan(input);
  printJson("CCR route（已脱敏）", plan.redactedRoute);
  printJson("CCR config（已脱敏）", plan.redactedConfig);

  if (hasFlag("--dry-run")) {
    // dry-run 是给无凭据环境使用的结构验证入口：只验证 route/config
    // 生成和脱敏输出，不启动本地 CCR，也不访问上游模型。
    console.log("dry-run 完成：未启动 CCR，未调用上游模型。");
    return;
  }

  const manager = new CcrManager({
    enabled: true,
    port: input.routerPort,
    configDir: input.configDir,
    spawn: spawnManagedCcr,
  });

  await manager.ensure(plan.config);
  try {
    await waitForCcr(manager.baseUrl());

    const provider = createClaudeProvider({
      apiKey: plan.route.apiKey,
      baseUrl: manager.baseUrl(),
      authMode: "x-api-key",
      model: plan.route.model,
      allowedTools: [],
    });

    const summary = createEmptyCcrSmokeSummary();
    const ac = new AbortController();
    const stream = provider.run({
      threadId: "ccr-smoke-thread",
      runId: `ccr-smoke-${Date.now()}`,
      userMessage: { role: "user", content: input.prompt },
      abortSignal: ac.signal,
      cwd: input.cwd,
      permissionMode: "ask",
      callbacks: {
        onRunUsage: (usage) => {
          summary.usage = {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalCostUsd: usage.totalCostUsd,
            ...(usage.model ? { model: usage.model } : {}),
          };
        },
      },
    });

    for await (const event of stream) {
      collectEvent(summary, event);
      if (event.type === EventType.RUN_ERROR) {
        printJson("CCR smoke 失败事件", event);
        process.exitCode = 1;
        break;
      }
    }

    printJson("CCR smoke 摘要", summary);
  } finally {
    manager.stop();
  }
}

await main();
