// runtime 层公开 API。
// 业务消费方（Vue / React / 测试）只需要从这里 import。

// 类型
export type {
  AGUIEventLike,
  ChatState,
  MessageBlock,
  MessageView,
  PendingInterrupt,
  ToolCallView,
} from "./types";
export { createInitialState } from "./types";

// 纯函数（reducer / 视图归一化 / 清扫）
export { applyEvent, type ArgsBuffer } from "./reducer";
export { buildViewMessages, sweepPendingToolCalls } from "./sweep";

// 副作用工具
export { ThinkingTimer } from "./thinking";
export {
  createResumableRun,
  type ResumableCloseReason,
  type ResumableRunOptions,
} from "./sse";

// HTTP 客户端
export {
  AGUIHttpClient,
  type AGUIApiOptions,
  type PostRunRequest,
  type ResumeRequest,
} from "./api";

// 组装层（最常用）
export {
  createChatRuntime,
  type ChatRuntime,
  type ChatRuntimeOptions,
} from "./runtime";
