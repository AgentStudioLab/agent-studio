# HITL Polish — Cowork-grade Tool Approval

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]` for tracking.

**Goal:** 把当前 HITL 工具批准卡片打磨到 Claude Cowork 的体感水平 —— 按工具类型定制渲染、就地展示、"始终允许"快捷、键盘 + 拒绝理由 + 风险提示 + 跨会话持久化。

**Architecture:** 全栈薄改造。前端拆出 `<ToolApprovalCard>`（按 toolName 分发到子卡）；allowlist 先用 React state（本会话），第三阶段持久化到 `tauri-plugin-store`；卡片渲染位置从 `ConversationContent` 末尾改成"紧跟匹配 tool_call block"（用 `toolUseID` 关联）。后端只在 Task 7 微调，加一个 settings 端点读 allowlist。

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + shadcn + ai-elements + lucide-react + `@tauri-apps/plugin-store`

**关键映射（在动手前必读）：**
- `PendingInterrupt.id === ToolCallView.id === toolUseID`（claude-agent-sdk 一致命名）
- `pendingInterrupt.payload = { toolName: string; input: Record<string, unknown>; title?: string; description?: string }`
- Claude Agent SDK 内置工具入参形状（用于子卡渲染）：
  - `Bash`: `{ command: string; cwd?: string; description?: string; timeout?: number }`
  - `Read`: `{ file_path: string; offset?: number; limit?: number }`
  - `Edit`: `{ file_path: string; old_string: string; new_string: string; replace_all?: boolean }`
  - `Write`: `{ file_path: string; content: string }`
  - `Glob`: `{ pattern: string; path?: string }`
  - `Grep`: `{ pattern: string; path?: string; glob?: string; output_mode?: string }`
  - `WebSearch`: `{ query: string; allowed_domains?: string[]; blocked_domains?: string[] }`
  - `WebFetch`: `{ url: string; prompt: string }`

---

## Task 1: 按工具类型定制渲染（Tier 1.1）

**Files:**
- Create: `src/features/task/ToolApprovalCard.tsx`
- Modify: `src/features/task/ChatStream.tsx`

**Approach:** 把 `pendingInterrupts.map(...)` 里的内联 JSX 抽到 `<ToolApprovalCard>`，按 `payload.toolName` 分发到具体的子卡。Fallback 仍是 JSON dump。子卡都用 `<Confirmation>` 包，差异只在 body。

- [ ] **Step 1: 创建 ToolApprovalCard 骨架**

```tsx
// src/features/task/ToolApprovalCard.tsx
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import type { BundledLanguage } from "shiki";
import type { PendingInterrupt } from "@/lib/agui/runtime";
import { Terminal, FileText, Search, Globe, Folder, Wrench } from "lucide-react";
import type { ReactNode } from "react";

interface ApprovalPayload {
  toolName?: string;
  input?: Record<string, unknown>;
  title?: string;
  description?: string;
}

export interface ToolApprovalCardProps {
  interrupt: PendingInterrupt;
  onAllow: () => void;
  onDeny: () => void;
}

export function ToolApprovalCard({ interrupt, onAllow, onDeny }: ToolApprovalCardProps) {
  const payload = interrupt.payload as ApprovalPayload;
  const toolName = payload.toolName ?? "tool";
  const input = (payload.input ?? {}) as Record<string, unknown>;

  const { icon, title, body } = renderTool(toolName, input, payload.title);

  return (
    <Confirmation approval={{ id: interrupt.id }} state="approval-requested">
      <ConfirmationTitle>
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
        </span>
      </ConfirmationTitle>
      {payload.description && (
        <p className="text-[12.5px]" style={{ color: "hsl(var(--text-300))" }}>
          {payload.description}
        </p>
      )}
      {body}
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" onClick={onDeny}>拒绝</ConfirmationAction>
          <ConfirmationAction onClick={onAllow}>允许</ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
    </Confirmation>
  );
}

interface ToolRender {
  icon: ReactNode;
  title: string;
  body: ReactNode;
}

function renderTool(name: string, input: Record<string, unknown>, override?: string): ToolRender {
  const titleFromOverride = override;
  switch (name) {
    case "Bash":      return renderBash(input, titleFromOverride);
    case "Read":      return renderRead(input, titleFromOverride);
    case "Edit":      return renderEdit(input, titleFromOverride);
    case "Write":     return renderWrite(input, titleFromOverride);
    case "Glob":      return renderGlob(input, titleFromOverride);
    case "Grep":      return renderGrep(input, titleFromOverride);
    case "WebSearch": return renderWebSearch(input, titleFromOverride);
    case "WebFetch":  return renderWebFetch(input, titleFromOverride);
    default:          return renderFallback(name, input, titleFromOverride);
  }
}

function ToolCodeBlock({ code, lang, filename }: { code: string; lang: BundledLanguage | "text"; filename: string }) {
  return (
    <CodeBlock code={code} language={lang as BundledLanguage} className="my-0">
      <CodeBlockHeader>
        <CodeBlockTitle><CodeBlockFilename>{filename}</CodeBlockFilename></CodeBlockTitle>
        <CodeBlockActions><CodeBlockCopyButton /></CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
```

- [ ] **Step 2: 实现 Bash/Read/Edit/Write 子卡**

```tsx
// 追加到 ToolApprovalCard.tsx
function renderBash(input: Record<string, unknown>, title?: string): ToolRender {
  const command = String(input.command ?? "");
  const cwd = typeof input.cwd === "string" ? input.cwd : undefined;
  return {
    icon: <Terminal size={14} />,
    title: title ?? "Agent Studio wants to run a shell command",
    body: (
      <>
        <ToolCodeBlock code={command} lang="bash" filename={cwd ?? "shell"} />
        {cwd && (
          <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>
            cwd: <code>{cwd}</code>
          </p>
        )}
      </>
    ),
  };
}

function renderRead(input: Record<string, unknown>, title?: string): ToolRender {
  const filePath = String(input.file_path ?? "");
  const offset = typeof input.offset === "number" ? input.offset : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  const range = offset !== undefined || limit !== undefined
    ? `（L${offset ?? 1}${limit ? `–L${(offset ?? 1) + limit - 1}` : "+"}）`
    : "";
  return {
    icon: <FileText size={14} />,
    title: title ?? `读取 ${filePath}${range}`,
    body: null,
  };
}

function renderEdit(input: Record<string, unknown>, title?: string): ToolRender {
  const filePath = String(input.file_path ?? "");
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const replaceAll = input.replace_all === true;
  const preview = `- ${truncate(oldStr, 240)}\n+ ${truncate(newStr, 240)}`;
  return {
    icon: <FileText size={14} />,
    title: title ?? `编辑 ${filePath}${replaceAll ? "（全部匹配）" : ""}`,
    body: <ToolCodeBlock code={preview} lang="diff" filename={filePath} />,
  };
}

function renderWrite(input: Record<string, unknown>, title?: string): ToolRender {
  const filePath = String(input.file_path ?? "");
  const content = String(input.content ?? "");
  const lines = content.split("\n").length;
  return {
    icon: <FileText size={14} />,
    title: title ?? `写入 ${filePath}（${lines} 行）`,
    body: <ToolCodeBlock code={truncate(content, 600)} lang="text" filename={filePath} />,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + `\n…(+${s.length - n} chars)`;
}
```

- [ ] **Step 3: 实现 Glob/Grep/WebSearch/WebFetch/Fallback 子卡**

```tsx
function renderGlob(input: Record<string, unknown>, title?: string): ToolRender {
  const pattern = String(input.pattern ?? "");
  const path = typeof input.path === "string" ? input.path : undefined;
  return {
    icon: <Folder size={14} />,
    title: title ?? `查找文件：${pattern}`,
    body: path ? <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>at <code>{path}</code></p> : null,
  };
}

function renderGrep(input: Record<string, unknown>, title?: string): ToolRender {
  const pattern = String(input.pattern ?? "");
  const path = typeof input.path === "string" ? input.path : undefined;
  const glob = typeof input.glob === "string" ? input.glob : undefined;
  return {
    icon: <Search size={14} />,
    title: title ?? `搜索：${pattern}`,
    body: (
      <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>
        {path && <>at <code>{path}</code> </>}
        {glob && <>filter <code>{glob}</code></>}
      </p>
    ),
  };
}

function renderWebSearch(input: Record<string, unknown>, title?: string): ToolRender {
  const query = String(input.query ?? "");
  return {
    icon: <Search size={14} />,
    title: title ?? `网页搜索：${query}`,
    body: null,
  };
}

function renderWebFetch(input: Record<string, unknown>, title?: string): ToolRender {
  const url = String(input.url ?? "");
  const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
  return {
    icon: <Globe size={14} />,
    title: title ?? `抓取网页：${url}`,
    body: prompt ? <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>{prompt}</p> : null,
  };
}

function renderFallback(name: string, input: Record<string, unknown>, title?: string): ToolRender {
  let dump = "";
  try { dump = JSON.stringify(input, null, 2); } catch { dump = String(input); }
  return {
    icon: <Wrench size={14} />,
    title: title ?? `Agent Studio wants to run ${name}`,
    body: <ToolCodeBlock code={dump} lang="text" filename="input" />,
  };
}
```

- [ ] **Step 4: 在 ChatStream 替换内联 JSX**

修改 `src/features/task/ChatStream.tsx`：

```tsx
import { ToolApprovalCard } from "@/features/task/ToolApprovalCard";
// 删除 Confirmation/ConfirmationActions/... 的 import（不再直接用）
// 删除 lines 161–222 的 pendingInterrupts.map 整块，替换为：
{pendingInterrupts.map((it) => (
  <ToolApprovalCard
    key={it.id}
    interrupt={it}
    onAllow={() => void onResume({ decisions: [{ type: "allow" }] })}
    onDeny={() => void onResume({ decisions: [{ type: "deny", message: "User declined" }] })}
  />
))}
```

- [ ] **Step 5: 验证类型 + 烟测**

```bash
bunx tsc -b
```

手动：触发 `Bash`（如让 agent 跑 `ls`）→ 看到终端图标 + 命令；触发 `Read` → 看到文件路径标题；未识别工具走 fallback JSON。

- [ ] **Step 6: 提交**

```bash
git add src/features/task/ToolApprovalCard.tsx src/features/task/ChatStream.tsx
git commit -m "feat(hitl): per-tool approval card rendering"
```

---

## Task 2: 本会话"始终允许"（Tier 1.2）

**Files:**
- Modify: `src/lib/agui/react/useChat.ts`
- Modify: `src/features/task/ToolApprovalCard.tsx`
- Modify: `src/features/task/ChatStream.tsx`
- Modify: `src/features/task/TaskView.tsx`

**Approach:** allowlist 是 `useChat` 内部的 `useState<Set<string>>`。新加 `addAllowedTool(name)` API。`useEffect` 监听 `pendingInterrupts`，发现 allowlist 命中就立刻 `resumeRun(allow)` 自动放行。卡片新加第三按钮"始终允许 [tool]"，同时执行 add + allow。

- [ ] **Step 1: useChat 暴露 allowedTools + addAllowedTool**

```tsx
// src/lib/agui/react/useChat.ts
// 在 useState/useMemo 区域加：
const [allowedTools, setAllowedTools] = useState<ReadonlySet<string>>(() => new Set());
const addAllowedTool = useCallback((name: string) => {
  setAllowedTools((prev) => {
    if (prev.has(name)) return prev;
    const next = new Set(prev);
    next.add(name);
    return next;
  });
}, []);

// 切换 thread 时清空（用 useEffect on opts.threadId）
useEffect(() => {
  setAllowedTools(new Set());
}, [opts.threadId]);

// return 里加 allowedTools, addAllowedTool
```

- [ ] **Step 2: TaskView 接入自动放行**

```tsx
// src/features/task/TaskView.tsx
const {
  // ... existing
  pendingInterrupts,
  resumeRun,
  allowedTools,
  addAllowedTool,
} = useChat({ threadId: activeTaskId ?? "" });

// 命中 allowlist 自动允许
const autoAllowFired = useRef<Set<string>>(new Set());
useEffect(() => {
  for (const it of pendingInterrupts) {
    if (autoAllowFired.current.has(it.id)) continue;
    const toolName = (it.payload as { toolName?: string }).toolName;
    if (toolName && allowedTools.has(toolName)) {
      autoAllowFired.current.add(it.id);
      void resumeRun({ decisions: [{ type: "allow" }] });
    }
  }
}, [pendingInterrupts, allowedTools, resumeRun]);
```

并把 `allowedTools` + `addAllowedTool` 透传给 `<ChatStream>`。

- [ ] **Step 3: ChatStream 透传 onAllowAlways**

```tsx
interface ChatStreamProps {
  // ... existing
  allowedTools: ReadonlySet<string>;
  onAllowAlways: (toolName: string) => void;
}

// 渲染时不要为 allowlist 命中的 interrupt 显示卡片
{pendingInterrupts
  .filter((it) => {
    const tn = (it.payload as { toolName?: string }).toolName;
    return !tn || !allowedTools.has(tn);
  })
  .map((it) => (
    <ToolApprovalCard
      key={it.id}
      interrupt={it}
      onAllow={() => void onResume({ decisions: [{ type: "allow" }] })}
      onDeny={() => void onResume({ decisions: [{ type: "deny", message: "User declined" }] })}
      onAllowAlways={onAllowAlways}
    />
  ))}
```

注：这里也 filter 掉命中的，因为 TaskView 的 useEffect 是异步的（微任务），有半帧的窗口会显示卡片再瞬间消失，filter 抹掉这个抖动。

- [ ] **Step 4: ToolApprovalCard 加第三按钮**

```tsx
export interface ToolApprovalCardProps {
  interrupt: PendingInterrupt;
  onAllow: () => void;
  onDeny: () => void;
  onAllowAlways?: (toolName: string) => void;
}

// ConfirmationActions 内部：
<ConfirmationAction variant="outline" onClick={onDeny}>拒绝</ConfirmationAction>
{onAllowAlways && payload.toolName && (
  <ConfirmationAction
    variant="outline"
    onClick={() => {
      onAllowAlways(payload.toolName!);
      onAllow();
    }}
  >
    始终允许 {payload.toolName}
  </ConfirmationAction>
)}
<ConfirmationAction onClick={onAllow}>允许</ConfirmationAction>
```

- [ ] **Step 5: 验证**

```bash
bunx tsc -b
```

手动：点"始终允许 Bash" → 后续 Bash 不再弹卡片，直接执行；切到另一个 thread 再回来，allowlist 清空。

- [ ] **Step 6: 提交**

```bash
git add src/lib/agui/react/useChat.ts src/features/task/{ToolApprovalCard,ChatStream,TaskView}.tsx
git commit -m "feat(hitl): per-session 'always allow' allowlist"
```

---

## Task 3: 卡片就地渲染（Tier 1.3）

**Files:**
- Modify: `src/features/task/ChatStream.tsx`

**Approach:** 把 `pendingInterrupts.map` 从 `ConversationContent` 末尾移到 `<MessageRow>` 内部 —— 紧跟 `toolUseID` 匹配的 `tool_call` block 所在的 process_group 之后。匹配 Map: `pendingInterrupt.id === toolCall.id`。

- [ ] **Step 1: 把 pendingInterrupts 下推到 MessageRow**

修改 `MessageRow` 签名：

```tsx
interface MessageRowProps {
  message: MessageView;
  showActions: boolean;
  interruptsByToolId: Map<string, PendingInterrupt>;
  renderApprovalCard: (it: PendingInterrupt) => ReactNode;
}
```

ChatStream 顶层构造 Map + render 闭包：

```tsx
const allowedTools: ReadonlySet<string> = props.allowedTools;

const interruptsByToolId = useMemo(() => {
  const m = new Map<string, PendingInterrupt>();
  for (const it of pendingInterrupts) {
    const tn = (it.payload as { toolName?: string }).toolName;
    if (tn && allowedTools.has(tn)) continue;
    m.set(it.id, it);
  }
  return m;
}, [pendingInterrupts, allowedTools]);

const renderApprovalCard = (it: PendingInterrupt) => (
  <ToolApprovalCard
    key={it.id}
    interrupt={it}
    onAllow={() => void onResume({ decisions: [{ type: "allow" }] })}
    onDeny={() => void onResume({ decisions: [{ type: "deny", message: "User declined" }] })}
    onAllowAlways={(name) => onAllowAlways(name)}
  />
);
```

- [ ] **Step 2: MessageRow 在 process_group 后插卡片**

```tsx
function MessageRow({ message, showActions, interruptsByToolId, renderApprovalCard }: MessageRowProps) {
  if (message.role === "user") return <UserMessage>{message.content}</UserMessage>;
  const grouped = groupBlocks(message.blocks);

  return (
    <div className="space-y-3">
      {grouped.map((b, i) => {
        if (b.kind === "process_group") {
          const matchingInterrupt = b.steps
            .map((s) => (s.kind === "tool_call" ? interruptsByToolId.get(s.tool.id) : undefined))
            .find((x): x is PendingInterrupt => Boolean(x));
          return (
            <div key={b.key} className="space-y-3">
              <ProcessGroup steps={b.steps} done={b.done} />
              {matchingInterrupt && renderApprovalCard(matchingInterrupt)}
            </div>
          );
        }
        // ... 其他 kind 不变
      })}
      {showActions && <MessageActions />}
    </div>
  );
}
```

- [ ] **Step 3: 顶层删除原 pendingInterrupts.map**

删除 ChatStream 主体里 `{pendingInterrupts.filter(...).map(...)}` 整块（已下推到 MessageRow）。**但保留**一个 "孤儿 fallback" —— 若 interrupt 没匹配上任何 message 的 tool_call，仍在底部渲染（防御性）：

```tsx
// 计算孤儿
const orphanInterrupts = useMemo(() => {
  const matchedIds = new Set<string>();
  for (const m of viewMessages) {
    if (m.role !== "assistant") continue;
    for (const b of m.blocks) {
      if (b.kind === "tool_call") matchedIds.add(b.toolCall.id);
    }
  }
  return [...interruptsByToolId.values()].filter((it) => !matchedIds.has(it.id));
}, [viewMessages, interruptsByToolId]);

// 渲染孤儿（仅当存在时）
{orphanInterrupts.map(renderApprovalCard)}
```

注意 ChatStream 没有 `viewMessages` 名字 —— 上层传的是 `messages`，按现有 props 用 `messages` 即可。

- [ ] **Step 4: 验证**

```bash
bunx tsc -b
```

手动：触发 Bash → 卡片应紧跟"Bash 调用"的 process group 出现（而非滚动到底部）；多轮对话时新卡片在对应回合而非全局底部。

- [ ] **Step 5: 提交**

```bash
git add src/features/task/ChatStream.tsx
git commit -m "feat(hitl): render approval card inline next to matching tool_call"
```

---

## Task 4: 键盘快捷键（Tier 2.1）

**Files:**
- Modify: `src/features/task/ToolApprovalCard.tsx`

**Approach:** 单例 `useEffect` 绑定 `document` 上的 keydown：`Enter` → allow、`Esc` → deny、`Cmd/Ctrl+Enter` → allow-always（仅当 onAllowAlways 存在）。卡片有多张时只第一张响应（用 useRef 选举）。在 textarea/input focused 时不拦截。

- [ ] **Step 1: 加 useEffect 绑定**

```tsx
// ToolApprovalCard.tsx 顶部
import { useEffect } from "react";

// 全局选举 ref —— 多张卡片只第一张激活快捷键
const activeCardId = { current: null as string | null };

// 组件内：
useEffect(() => {
  if (activeCardId.current === null) activeCardId.current = interrupt.id;
  if (activeCardId.current !== interrupt.id) return;

  const onKey = (e: KeyboardEvent) => {
    // 焦点在表单元素里不拦截（让用户能正常输入）
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) return;

    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      const tn = (interrupt.payload as { toolName?: string }).toolName;
      if (onAllowAlways && tn) {
        e.preventDefault();
        onAllowAlways(tn);
        onAllow();
      }
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); onAllow(); return; }
    if (e.key === "Escape") { e.preventDefault(); onDeny(); return; }
  };

  document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener("keydown", onKey);
    if (activeCardId.current === interrupt.id) activeCardId.current = null;
  };
}, [interrupt.id, onAllow, onDeny, onAllowAlways]);
```

- [ ] **Step 2: 在按钮上加键提示**

```tsx
<ConfirmationAction variant="outline" onClick={onDeny}>拒绝 <kbd className="ml-1 opacity-60">Esc</kbd></ConfirmationAction>
<ConfirmationAction onClick={onAllow}>允许 <kbd className="ml-1 opacity-60">⏎</kbd></ConfirmationAction>
```

- [ ] **Step 3: 验证 + 提交**

```bash
bunx tsc -b
git add src/features/task/ToolApprovalCard.tsx
git commit -m "feat(hitl): keyboard shortcuts on approval card (Enter/Esc/Cmd+Enter)"
```

---

## Task 5: 拒绝理由输入（Tier 2.2）

**Files:**
- Modify: `src/features/task/ToolApprovalCard.tsx`

**Approach:** 点"拒绝"先 inline 展开一个 textarea + "取消 / 确认拒绝" 按钮。Esc 进入展开态、回车（textarea 里 Cmd+Enter）确认。空理由时回落 "User declined"。

- [ ] **Step 1: 加 expand state + textarea UI**

```tsx
// 修改 ToolApprovalCardProps: onDeny 改成 onDeny(reason: string) => void
// ChatStream 调用方相应更新

import { useState } from "react";

// 组件内：
const [denyExpanded, setDenyExpanded] = useState(false);
const [denyReason, setDenyReason] = useState("");

const handleDenyClick = () => {
  if (!denyExpanded) {
    setDenyExpanded(true);
    // 下一帧 focus textarea
    queueMicrotask(() => {
      document.getElementById(`deny-${interrupt.id}`)?.focus();
    });
    return;
  }
  onDeny(denyReason.trim() || "User declined");
};

// 在 ConfirmationRequest 上方加：
{denyExpanded && (
  <textarea
    id={`deny-${interrupt.id}`}
    value={denyReason}
    onChange={(e) => setDenyReason(e.target.value)}
    placeholder="（可选）告诉 agent 为什么拒绝，按 ⌘⏎ 确认"
    onKeyDown={(e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onDeny(denyReason.trim() || "User declined");
      }
    }}
    className="w-full min-h-[60px] resize-y rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
    style={{
      borderColor: "hsl(var(--border-100))",
      color: "hsl(var(--text-100))",
    }}
  />
)}
```

- [ ] **Step 2: 调整 keydown 与 deny 联动**

Task 4 里的 Esc 处理改成：未展开时点 Esc 直接 deny + 默认理由；展开后 Esc 收起 textarea 而非提交（更接近 Cowork 的"再想想"）。

```tsx
if (e.key === "Escape") {
  e.preventDefault();
  if (denyExpanded) setDenyExpanded(false);
  else onDeny("User declined");
  return;
}
```

- [ ] **Step 3: 调用方更新签名**

`ChatStream.tsx` 的 `renderApprovalCard`：

```tsx
onDeny={(reason) => void onResume({ decisions: [{ type: "deny", message: reason }] })}
```

- [ ] **Step 4: 验证 + 提交**

```bash
bunx tsc -b
git add src/features/task/ToolApprovalCard.tsx src/features/task/ChatStream.tsx
git commit -m "feat(hitl): expandable deny-with-reason input"
```

---

## Task 6: 风险标签（Tier 2.3）

**Files:**
- Create: `src/features/task/tool-risk.ts`
- Modify: `src/features/task/ToolApprovalCard.tsx`

**Approach:** 启发式判断风险等级 ⇒ 渲染 lucide AlertTriangle + 标签。覆盖：Bash 中的 `rm -rf` / `sudo` / 写入 `~/` 外 / `chmod -R` / `dd` / `mkfs`、网络命令、Edit/Write 越权路径。返回 `{ level: "high" | "medium" | "none"; label?: string }`。

- [ ] **Step 1: 创建 risk 模块 + 测试**

```ts
// src/features/task/tool-risk.ts
export type RiskLevel = "high" | "medium" | "none";
export interface ToolRisk { level: RiskLevel; label?: string }

const DANGEROUS_BASH = /\b(rm\s+-rf?|sudo|chmod\s+-R|dd\s+if=|mkfs|mv\s+\/|>\s*\/dev\/)/i;
const NETWORK_BASH = /\b(curl|wget|nc|netcat|ssh|scp|rsync)\b/i;

export function assessToolRisk(toolName: string, input: Record<string, unknown>): ToolRisk {
  if (toolName === "Bash") {
    const cmd = String(input.command ?? "");
    if (DANGEROUS_BASH.test(cmd)) return { level: "high", label: "破坏性" };
    if (NETWORK_BASH.test(cmd)) return { level: "medium", label: "网络访问" };
    return { level: "none" };
  }
  if (toolName === "WebFetch" || toolName === "WebSearch") {
    return { level: "medium", label: "网络访问" };
  }
  if (toolName === "Write" || toolName === "Edit") {
    const fp = String(input.file_path ?? "");
    if (/^\/(etc|usr|System|bin|sbin)\b/.test(fp)) return { level: "high", label: "系统路径" };
    return { level: "none" };
  }
  return { level: "none" };
}
```

```ts
// src/features/task/tool-risk.test.ts（用 bun test 跑）
import { describe, it, expect } from "bun:test";
import { assessToolRisk } from "./tool-risk";

describe("assessToolRisk", () => {
  it("flags rm -rf as high", () => {
    expect(assessToolRisk("Bash", { command: "rm -rf node_modules" }).level).toBe("high");
  });
  it("flags curl as medium", () => {
    expect(assessToolRisk("Bash", { command: "curl https://example.com" }).level).toBe("medium");
  });
  it("flags WebSearch as medium", () => {
    expect(assessToolRisk("WebSearch", { query: "anything" }).level).toBe("medium");
  });
  it("flags writing to /etc as high", () => {
    expect(assessToolRisk("Write", { file_path: "/etc/hosts" }).level).toBe("high");
  });
  it("normal Bash returns none", () => {
    expect(assessToolRisk("Bash", { command: "ls -la" }).level).toBe("none");
  });
});
```

注：前端 src/ 下能跑 bun test 吗？看 package.json 是否有 `test` script；如果没有，标记跳过测试或加 `"test": "bun test"`。如果环境只有 vitest，则改用 vitest 等同语法。

- [ ] **Step 2: 测试通过**

```bash
bun test src/features/task/tool-risk.test.ts
```

- [ ] **Step 3: ToolApprovalCard 显示标签**

```tsx
import { AlertTriangle } from "lucide-react";
import { assessToolRisk } from "./tool-risk";

// 组件内：
const risk = assessToolRisk(toolName, input);

// 在 ConfirmationTitle 后渲染：
{risk.level !== "none" && risk.label && (
  <span
    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
    style={{
      background: risk.level === "high" ? "hsl(var(--danger-100) / 0.15)" : "hsl(var(--warning-100) / 0.15)",
      color: risk.level === "high" ? "hsl(var(--danger-100))" : "hsl(var(--warning-100))",
    }}
  >
    <AlertTriangle size={11} />
    {risk.label}
  </span>
)}
```

如果 design-tokens 里没有 `--warning-100`，先去 `src/styles/semantic/` 查；缺则降级到 `--text-200` + outlined border。**先 invoke design-tokens skill 再写**。

- [ ] **Step 4: 验证 + 提交**

```bash
bunx tsc -b
git add src/features/task/{tool-risk.ts,tool-risk.test.ts,ToolApprovalCard.tsx}
git commit -m "feat(hitl): risk badges for destructive/network tools"
```

---

## Task 7: 跨会话 allowlist 持久化（Tier 3.1）

**Files:**
- Create: `src/lib/hitl-allowlist.ts`
- Modify: `src/lib/agui/react/useChat.ts`
- Modify: `src/features/settings/*` —— 加 allowlist 管理 UI（看 settings feature 结构）

**Approach:** `tauri-plugin-store` 写在 `agent-studio-store.json` 下 key `hitl.allowedTools`。封装 load/save 两个 promise，启动时一次 load，addAllowedTool 后异步 save。当前会话仍走 Set 内存态，但启动时合并 store 已存的工具名。

- [ ] **Step 1: hitl-allowlist 模块**

```ts
// src/lib/hitl-allowlist.ts
import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "agent-studio-store.json";
const KEY = "hitl.allowedTools";
const store = new LazyStore(STORE_PATH);

export async function loadAllowedTools(): Promise<string[]> {
  const v = await store.get<string[]>(KEY);
  return Array.isArray(v) ? v : [];
}

export async function saveAllowedTools(tools: readonly string[]): Promise<void> {
  await store.set(KEY, [...tools]);
  await store.save();
}
```

- [ ] **Step 2: useChat 启动 load + 改动后 save**

把 useChat 里的 allowedTools 提升到一个 module-level 状态，或者用 React Context 注入到全应用。简化：在 useChat 内部 useEffect 启动 load，set 改动后 save。**注意：跨会话 allowlist 应该是全局而非每个 thread 一份**。

实现：把 allowedTools 改为 module-level + 简单 pub/sub，或挂到 `useContext`。最小改动：

```tsx
// src/lib/agui/react/useChat.ts 顶层
import { loadAllowedTools, saveAllowedTools } from "@/lib/hitl-allowlist";

let globalAllowed = new Set<string>();
const listeners = new Set<() => void>();
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const list = await loadAllowedTools();
  globalAllowed = new Set(list);
  listeners.forEach((fn) => fn());
}

function notify() { listeners.forEach((fn) => fn()); }

// useChat 内部：
const [allowedTools, setAllowedToolsLocal] = useState<ReadonlySet<string>>(globalAllowed);
useEffect(() => {
  void ensureLoaded();
  const listener = () => setAllowedToolsLocal(new Set(globalAllowed));
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}, []);
const addAllowedTool = useCallback((name: string) => {
  if (globalAllowed.has(name)) return;
  globalAllowed = new Set(globalAllowed);
  globalAllowed.add(name);
  notify();
  void saveAllowedTools([...globalAllowed]);
}, []);
const removeAllowedTool = useCallback((name: string) => {
  if (!globalAllowed.has(name)) return;
  globalAllowed = new Set(globalAllowed);
  globalAllowed.delete(name);
  notify();
  void saveAllowedTools([...globalAllowed]);
}, []);

// 删除原先 useEffect(() => setAllowedTools(new Set()), [threadId]) —— 不再 per-thread

// return 里多导一个 removeAllowedTool
```

- [ ] **Step 3: Settings UI 加 allowlist 管理段**

定位 `src/features/settings/SettingsView.tsx` 或者 `ProfileForm.tsx`；新加一个 "已允许的工具" 段，listings + remove 按钮。i18n 字段 `settings.hitl.title` / `settings.hitl.empty` / `settings.hitl.remove`。

```tsx
// 简化示例
const { allowedTools, removeAllowedTool } = useChat({ threadId: "" }); // 仅为读取 allowlist，不挂 SSE
// 注意：用 useChat 仅为 allowlist 不太合适，更干净的方式是抽出 useAllowedTools hook
```

更好做法：抽 `src/lib/agui/react/useAllowedTools.ts` 单独 hook，settings 直接用。useChat 内部也调它。

- [ ] **Step 4: 验证 + 提交**

```bash
bunx tsc -b
```

手动：始终允许 Bash → 重启应用 → Bash 仍 auto-allow；settings 里能看到 Bash 并能移除。

```bash
git add src/lib/{hitl-allowlist.ts,agui/react/useAllowedTools.ts,agui/react/useChat.ts} src/features/settings/*
git commit -m "feat(hitl): persist allowed tools across sessions"
```

---

## Verification（端到端）

完成全部任务后：

1. **Task 1**：Bash 卡片显示终端图标 + 命令；Read 显示路径标题；未知工具走 fallback JSON。
2. **Task 2**：点"始终允许 Bash" → 后续 Bash 不弹卡片；切到别的 thread 同样不弹（因为已是跨会话了——见 Task 7）。
3. **Task 3**：卡片跟在触发它的 process_group 后面，不再滚到底部。多 thread 历史滚动正确。
4. **Task 4**：Enter / Esc / Cmd+Enter 在卡片焦点时按预期工作；textarea focus 时不拦截。
5. **Task 5**：点 拒绝 → 展开 textarea → 输入 → Cmd+Enter → agent 看到自定义消息。
6. **Task 6**：`rm -rf` 显示红色"破坏性"；`curl` 显示橙色"网络访问"；`ls` 无标签。
7. **Task 7**：重启 `bun tauri:dev` 后 allowlist 仍生效；Settings 能管理。

## 执行顺序

```
Task 1 ──→ Task 2 ──→ Task 3   (Tier 1)
                        │
                        ├──→ Task 4 ──→ Task 5  (Tier 2 — 5 依赖 4 的 keydown 集成)
                        │
                        └──→ Task 6              (Tier 2 — 独立)
                                        │
                                        └──→ Task 7  (Tier 3)
```
