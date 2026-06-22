// runtime 层公共类型定义。
// 本文件不依赖任何框架（Vue / React / 等），只描述协议形状和状态结构。
// 所有可被业务层消费的类型都集中在此，避免散落到各处出现循环依赖。

// ============ 视图层（UI 直接消费的形状） ============

export interface SideEffectFile {
  /** Absolute filesystem path. */
  path: string;
  /** Whether the Bash call created the file or modified an existing one. */
  kind: "created" | "modified";
}

/**
 * 工具调用的视图模型。
 * 跟服务端 wire-format 的差异：args 在流式过程中可能是部分 JSON 字符串，
 * 解析失败时保留原 buffer，不抛错。
 */
export interface ToolCallView {
  id: string;
  toolName: string;
  args: unknown;
  result: unknown | null;
  status: "pending" | "success" | "error";
  errorMsg?: string;
  /**
   * Files the agent indirectly produced/modified during this tool call.
   * Only Bash tool calls receive this (from the PostToolUse cwd-diff hook
   * on the sidecar). Mutation tools (Write/Edit/...) declare their target
   * in `args` instead.
   */
  sideEffects?: SideEffectFile[];
}

/**
 * 一条 assistant 回合内的展示块。
 * 顺序保留服务端发送顺序，UI 按这个顺序渲染：
 *   reasoning → text → tool_call → notice
 *
 * notice 块是客户端注入的（如用户主动取消时插入"已被用户中止"）。
 * streaming 标记仅 reasoning 在用，配合 shimmer 动效。
 */
/**
 * Notice block reasons drive the UI affordance attached to "已被用户中止":
 *   - "user"            (default): user pressed Stop / denied a tool. No CTA.
 *   - "process_restart": sidecar 进程在等待用户处理时退出；内存中的 deferred
 *     已丢失，重启后 run 会被归并为 cancelled。前端展示“继续上次任务”，让用户
 *     通过新 prompt 续上上下文（SDK session id 会重放历史）。
 */
export type NoticeReason = "user" | "process_restart";

export type MessageBlock =
  | { kind: "text"; id: string; content: string }
  | { kind: "reasoning"; id: string; content: string; streaming?: boolean }
  | { kind: "tool_call"; toolCall: ToolCallView }
  | {
      kind: "notice";
      id: string;
      level: "interrupted";
      content: string;
      reason?: NoticeReason;
    };

/**
 * 一条对话回合。
 * - user：单条字符串
 * - assistant：有序 block 列表，覆盖两条 user 消息之间所有 AIMessage 帧
 */
export type MessageView =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; blocks: MessageBlock[] };

// ============ 协议层（与服务端约定） ============

/**
 * 服务端在 RUN_FINISHED 中带回的等待用户决策的 interrupt。
 * 详见 packages/shared/CONTRACT.md §D。
 */
export interface PendingInterrupt {
  id: string;
  reason: "tool_approval" | "ask_user" | "unknown";
  payload: Record<string, unknown>;
}

export type AgentTaskStatus = "pending" | "in_progress" | "completed";

export interface AgentTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: AgentTaskStatus;
  updatedAt: number;
}

/**
 * AG-UI 事件的最小约束 —— 只要求 type 字段。
 * 具体事件类型见 reducer 中的 case 列表。
 */
export interface AGUIEventLike {
  type: string;
  [k: string]: unknown;
}

// ============ 运行时状态 ============

/**
 * runtime 内部维护的完整聊天状态。
 * 这是个不可变对象 —— reducer 每次返回新的 ChatState，订阅者收到新引用即知有变化。
 */
export interface ChatState {
  /** 已完成的历史消息，从 history endpoint 拉来 + 上一轮 run 结束后归档过来 */
  historicalMessages: MessageView[];
  /** 当前正在流式接收的消息 —— run 结束后并入 historical */
  liveMessages: MessageView[];
  /** 是否有 run 在跑（含等待 SSE 首字节的阶段） */
  isRunning: boolean;
  /** 是否进入"线路安静"状态（>600ms 无事件且 isRunning），UI 用来显示 shimmer */
  isThinking: boolean;
  /** 当前活跃 run 的 id，结束后清空 */
  activeRunId: string | null;
  /** 等待用户决策的 interrupts（HITL） */
  pendingInterrupts: PendingInterrupt[];
  /** 用户可见的错误信息，nullable */
  error: string | null;
  /** SSE 最后收到的事件游标，续连/恢复时用 */
  lastCursor: string | null;
  /** RUN_STARTED 写入的 epoch ms 时间戳；RUN_FINISHED / RUN_ERROR 清空。
   *  UI 用来计算每秒刷新的 elapsed 显示。 */
  runStartedAt: number | null;
  /** RUN_ERROR 携带的归一化错误码 */
  errorCode?: RunErrorCode;
  /** 最近一次 retry 状态 */
  retry?: RetryState;
  /** bridge 最新推送的 agent task 快照，供输入框上方的任务面板展示 */
  tasks: AgentTask[];
  /** 是否已经收到过显式 task 快照；用于区分“还没同步”和“同步结果为空” */
  hasTaskSnapshot: boolean;
}

export type RunErrorCode =
  | "AUTH_FAILED" | "RATE_LIMIT" | "UPSTREAM_5XX" | "BILLING_ERROR"
  | "MODEL_ERROR" | "MAX_TURNS" | "MAX_BUDGET" | "EXECUTION_ERROR"
  | "WORKER_ERROR" | "CANCELLED" | "INSUFFICIENT_CREDITS";

export interface RetryState {
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  errorStatus: number | null;
  error: string;
  ts: number;
}

/**
 * 创建一个干净的初始状态。
 * 不要直接 mutate 这个对象 —— reducer 永远返回新对象。
 */
export function createInitialState(): ChatState {
  return {
    historicalMessages: [],
    liveMessages: [],
    isRunning: false,
    isThinking: false,
    activeRunId: null,
    pendingInterrupts: [],
    error: null,
    lastCursor: null,
    runStartedAt: null,
    tasks: [],
    hasTaskSnapshot: false,
  };
}
