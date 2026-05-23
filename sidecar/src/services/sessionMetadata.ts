/**
 * 每个 thread 一份「最近一次 system.init 时 SDK 报告的能力快照」。
 * 内存态——sidecar 重启失效。下一个 Run 触发后 bridge 会 upsert 回来。
 *
 * 数据由 provider-claude/bridge.ts 在解析 SDKSystemMessage init 时
 * 通过 onInitMetadata 回调写入；GET /threads/:id/context 路由读出来。
 */

export interface SessionInitMeta {
  mcpServers: Array<{ name: string; status: string }>;
  tools: string[];
}

export interface SessionInitRecord extends SessionInitMeta {
  updatedAt: number;
}

export class SessionMetadataStore {
  private map = new Map<string, SessionInitRecord>();

  upsert(threadId: string, meta: SessionInitMeta): void {
    this.map.set(threadId, { ...meta, updatedAt: Date.now() });
  }

  get(threadId: string): SessionInitRecord | undefined {
    return this.map.get(threadId);
  }
}
