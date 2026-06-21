import { EventType } from "@ag-ui/core";
import type { RunEventStore } from "../core/store-types";
import type { AGUIEvent } from "../core/types";

export type PermissionResult =
  | { behavior: "allow" }
  | { behavior: "deny"; message: string };

export interface ApprovalRequest {
  runId: string;
  threadId: string;
  toolUseID: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
}

/**
 * Structured answers from an AskUserQuestion form. Keyed by question text per
 * SDK's `AskUserQuestionOutput.answers`. Multi-select values are comma-joined
 * labels ("Option A,Option C"); a custom "Something else" answer is the raw
 * string; a skipped question is the empty string. Annotations are reserved
 * for future free-text notes per question.
 */
export interface AskUserAnswers {
  answers: Record<string, string>;
  annotations?: Record<string, { notes?: string; preview?: string }>;
}

/** Subset of the SDK's question schema we re-emit verbatim to the client. */
export interface AskUserQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string; preview?: string }[];
}

export interface AskUserRequest {
  runId: string;
  threadId: string;
  toolUseID: string;
  questions: AskUserQuestion[];
}

export interface InterruptBus {
  /**
   * canUseTool 调用：写入合成 RUN_FINISHED(outcome:"interrupt")，把 run
   * 切到 "awaiting_user" 表示等待用户决策，再等 /resume 调 bus.resolve()
   * 返回允许或拒绝。
   */
  requestApproval(req: ApprovalRequest): Promise<PermissionResult>;
  /**
   * 复用 RUN_FINISHED(interrupt) 传输机制，但 interrupt reason 为
   * "ask_user"，恢复值是结构化答案表。toolName === "AskUserQuestion"
   * 时由 canUseTool 触发，表示等待用户输入。
   *
   * 两条路径不能共用 deferred map：resolver 类型不同。分离后 resume route
   * 也能干净地拒绝错配 payload（例如给 tool_approval interrupt 发送
   * ask_user answers 是协议错误）。
   */
  requestAskUser(req: AskUserRequest): Promise<AskUserAnswers>;
  /**
   * Called from POST /runs/:runId/resume. Returns true if the deferred was
   * found and resolved; false if no matching pending interrupt.
   */
  resolve(runId: string, interruptId: string, result: PermissionResult): boolean;
  /** Same as resolve, but for ask_user interrupts. */
  resolveAskUser(runId: string, interruptId: string, result: AskUserAnswers): boolean;
  /**
   * runWorker 进入终态时调用：把该 run 的所有 pending deferred 释放为
   * `deny`（tool approval）或空答案（ask_user），让 SDK 侧解除等待并清理。
   * 同时丢弃本 run 的 approval-rule 集合（内存卫生；runId 不会复用）。
   */
  cancelAll(runId: string): void;

  // ─── 命令级「始终允许」规则（按 runId，仅内存） ───────────────────────────
  // canUseTool 命中即放行（B2 方案）。run 启动时 seed 一次（前端经 POST /runs 传
  // approvalRules）；run 内点「始终允许」经 /resume 的 persistRule 追加，立即对
  // 后续工具调用生效。run 终止由 cancelAll 清理。
  /** run 启动时种入初始规则。加性合并：多次 seed（含 resume 重连时种空集）都不会
   *  清空 run 内经 addRule 累积的规则。 */
  seedRules(runId: string, rules: string[]): void;
  /** run 内追加一条规则（如卡片「始终允许此前缀」）。 */
  addRule(runId: string, rule: string): void;
  /** 读取本 run 当前生效的规则集（canUseTool 用）。 */
  getRules(runId: string): ReadonlySet<string>;
}

export interface CreateInterruptBusOptions {
  store: RunEventStore;
}

export function createInterruptBus(opts: CreateInterruptBusOptions): InterruptBus {
  const { store } = opts;
  // 两个 map 都按 `${runId}:${interruptId}` 索引；分开存放是因为 resolver
  // 值类型不同。resolve() / resolveAskUser() 各查各的 map，让过期或打错类型的
  // resume 请求干净地返回 false，而不是把错误 shape 塞进 deferred。
  const permissionDeferreds = new Map<string, (r: PermissionResult) => void>();
  const askUserDeferreds = new Map<string, (r: AskUserAnswers) => void>();
  // 命令级「始终允许」规则，按 runId。值为 CC 规则串集合（见 approval-rules.ts）。
  const runRules = new Map<string, Set<string>>();
  const EMPTY_RULES: ReadonlySet<string> = new Set();

  return {
    async requestApproval(req) {
      const key = `${req.runId}:${req.toolUseID}`;
      if (permissionDeferreds.has(key)) {
        throw new Error(`duplicate requestApproval for ${key}`);
      }

      const pending = new Promise<PermissionResult>((resolve) => {
        permissionDeferreds.set(key, resolve);
      });

      const event = {
        type: EventType.RUN_FINISHED,
        threadId: req.threadId,
        runId: req.runId,
        outcome: "interrupt",
        interrupts: [
          {
            id: req.toolUseID,
            reason: "tool_approval",
            payload: {
              toolName: req.toolName,
              input: req.input,
              ...(req.title ? { title: req.title } : {}),
              ...(req.description ? { description: req.description } : {}),
            },
          },
        ],
      } as unknown as AGUIEvent;

      await store.appendEvent(req.runId, event);
      await store.finishRun(req.runId, "awaiting_user");

      return pending;
    },

    async requestAskUser(req) {
      const key = `${req.runId}:${req.toolUseID}`;
      if (askUserDeferreds.has(key)) {
        throw new Error(`duplicate requestAskUser for ${key}`);
      }

      const pending = new Promise<AskUserAnswers>((resolve) => {
        askUserDeferreds.set(key, resolve);
      });

      const event = {
        type: EventType.RUN_FINISHED,
        threadId: req.threadId,
        runId: req.runId,
        outcome: "interrupt",
        interrupts: [
          {
            id: req.toolUseID,
            reason: "ask_user",
            payload: {
              toolName: "AskUserQuestion",
              questions: req.questions,
            },
          },
        ],
      } as unknown as AGUIEvent;

      await store.appendEvent(req.runId, event);
      await store.finishRun(req.runId, "awaiting_user");

      return pending;
    },

    resolve(runId, interruptId, result) {
      const key = `${runId}:${interruptId}`;
      const fn = permissionDeferreds.get(key);
      if (!fn) return false;
      permissionDeferreds.delete(key);
      fn(result);
      return true;
    },

    resolveAskUser(runId, interruptId, result) {
      const key = `${runId}:${interruptId}`;
      const fn = askUserDeferreds.get(key);
      if (!fn) return false;
      askUserDeferreds.delete(key);
      fn(result);
      return true;
    },

    cancelAll(runId) {
      const prefix = `${runId}:`;
      for (const [key, fn] of permissionDeferreds) {
        if (!key.startsWith(prefix)) continue;
        permissionDeferreds.delete(key);
        fn({ behavior: "deny", message: "run cancelled" });
      }
      for (const [key, fn] of askUserDeferreds) {
        if (!key.startsWith(prefix)) continue;
        askUserDeferreds.delete(key);
        // Empty answers map → agent receives a no-op AskUserQuestion result;
        // it can decide whether to retry or move on. Matches the "X close
        // sends partial" spec when the partial is "nothing answered."
        fn({ answers: {} });
      }
      runRules.delete(runId);
    },

    seedRules(runId, rules) {
      // 加性合并：若该 run 已有规则集（含 addRule 追加的），只补充不清空。这样即便
      // 未来 runTurn 在一个 run 内被多次调用（如 resume 重连），也不会丢失已批准的规则。
      const existing = runRules.get(runId);
      if (existing) {
        for (const r of rules) existing.add(r);
      } else {
        runRules.set(runId, new Set(rules));
      }
    },

    addRule(runId, rule) {
      const existing = runRules.get(runId);
      if (existing) existing.add(rule);
      else runRules.set(runId, new Set([rule]));
    },

    getRules(runId) {
      return runRules.get(runId) ?? EMPTY_RULES;
    },
  };
}
