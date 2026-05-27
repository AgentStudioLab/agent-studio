# AskUserQuestion 表单卡片设计

**日期：** 2026-05-27
**作者：** jay.yang（与 Claude pair design）

## 1. Background

Anthropic 官方 `AskUserQuestion` 工具用于让 agent 主动问用户结构化问题（单选 / 多选 / 每题可写自由文本）。当前 Agent Studio 把这个工具当成普通工具来 HITL——前端用 `ToolApprovalCard` 渲染"允许 / 拒绝 / 始终允许"按钮 + JSON dump（见 issue 图 17），用户无法直接答题，只能允许或拒绝，本质上 UX 是错的：

- **AskUserQuestion 是表单**，不是工具调用审批
- 用户的每道题都"可填可空可跳过"
- 工具审批是"必须二选一"

要把这两类 interrupt 在前端彻底分流，让 AskUserQuestion 走自己的表单 UI。

## 2. Goals

- AskUserQuestion 进入聊天流时渲染成结构化表单卡，**不再**走 `ToolApprovalCard`
- 支持单选 / 多选 / 每题 "Something else"（自由文本）/ 每题 Skip
- 多道题在同一张卡内**分页**展示（1 of N + 左右箭头 + 关闭）
- 用户答完 → 把"答案 + 跳过标记"打包成工具结果回给 agent
- 用户点 X → 把"已答 + 未答 null"全部回给 agent，让 agent 自己判断
- 没有"始终允许"——它是表单不是审批

## 3. Non-Goals

- 不改 Anthropic 官方 `AskUserQuestion` skill 的实现（项目 memory 硬约束 #1）
- 不把工具审批 UI 也改了——`ToolApprovalCard` 继续负责所有 `reason: "tool_approval"`
- 不支持拖拽排序（截图 20 仅作灵感，AskUserQuestion 数据本身没有 ordering 题型）
- 不内嵌富文本——"Something else" 仅支持纯文本

## 4. Design

### 4.1 服务端（sidecar）侧改动

#### 4.1.1 Interrupt 分流：reason='ask_user'

Anthropic SDK 调 AskUserQuestion 工具时，sidecar 现在和别的工具一样进入 HITL，发出 `reason: "tool_approval"` 的 interrupt。改成：

- **识别条件**：`toolName === "AskUserQuestion"`
- 发出 `reason: "ask_user"` 的 interrupt，`payload` 内含原始 input（`questions[]`）+ 必要的 `toolUseId`

`AGUIInterrupt.reason` 已经声明过 `"ask_user"`（见 `sidecar/src/agui/core/interrupts.ts`），只是没人产出。具体钩在 `sidecar/src/agui/provider-claude/bridge.ts` 的 HITL 分流点（待落地时探明具体函数）。

#### 4.1.2 Resume payload → tool_result 翻译

前端 POST `/runs/:id/resume` 时带的 payload（见 4.3）是 ask_user 结构化答案。sidecar 收到后：

1. 校验 `interruptId` 对应的 interrupt 是 `reason === "ask_user"`
2. 把 `answers[]` 翻译成 Anthropic AskUserQuestion 期望的 tool_result 形状：
   ```json
   {
     "answers": {
       "<question text>": "<option label> | <custom text> | null"
     }
   }
   ```
3. 用这个 result 续推 Claude SDK

跳过的题在 `answers` 里值为 `null`。

### 4.2 前端组件结构

新建 feature-local 目录 `src/features/task/ask-user/`：

```
ask-user/
  AskUserCard.tsx          # 容器 + 分页 state + 提交逻辑
  AskUserHeader.tsx        # 标题 + 1 of N + < > + X
  QuestionPage.tsx         # 单题分发器（按 multiSelect 路由）
  SingleSelectList.tsx     # 数字 1-N 行，选中自动 advance
  MultiSelectList.tsx      # checkbox 行 + "N selected" 计数
  SomethingElseRow.tsx     # 铅笔 prefix + 内联 textarea
  AskUserFooter.tsx        # Skip + Next / Send 按钮
  types.ts                 # 协议类型
```

#### 4.2.1 数据契约（types.ts）

```ts
// 与 server 协议同步——payload 解码后的强类型
export interface AskUserPayload {
  toolUseId: string;
  questions: AskUserQuestionDef[];
}

export interface AskUserQuestionDef {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
}

// 用户在一道题上的最终状态
export type AskUserAnswer =
  | { kind: "selected"; labels: string[] }   // 单选 labels.length===1；多选≥1
  | { kind: "custom"; text: string }          // Something else 已写
  | { kind: "skipped" };                      // 跳过或未触
```

注意 `kind: "selected"` 用 `labels: string[]` 统一表示单选 / 多选，简化下游。

#### 4.2.2 AskUserCard：分页 state

```tsx
const [page, setPage] = useState(0);            // 0..questions.length-1
const [answers, setAnswers] = useState<Map<number, AskUserAnswer>>(new Map());
const [customDraft, setCustomDraft] = useState<Map<number, string>>(new Map());
```

`answers` 按题号下标存（不是 question 文本——文本可能很长，下标更稳）。
`customDraft` 单独存"Something else"草稿，避免用户切页时丢字。

单选选中 → 写 answers + setTimeout 自动 advance（避免动画卡顿）。
多选选中 → 仅写 answers；前进按 → 或 Skip。

#### 4.2.3 X / 关全部

X 触发提交 `flush()`：把所有 page 的当前 state 打包发 resume：
- 已答的题 → 对应 `{ kind: "selected" | "custom" }`
- 未答 / 跳过 → `{ kind: "skipped" }`

### 4.3 Resume payload 协议

复用 `decisions[]` 通道，新增一种 decision type：

```ts
// 前端发给 server 的 ResumeRequest
{
  resumes: [{
    interruptId: "<id>",
    payload: {
      decisions: [{
        type: "ask_user_answers",
        toolUseId: "<original tool_use_id>",
        answers: [
          { question: "项目信息", selected: ["告诉我项目详情"] },
          { question: "目标受众", custom: "管理层但同时给技术细节" },
          { question: "视觉风格", skipped: true },
          { question: "内容板块", selected: ["项目背景与目标", "技术架构"] }
        ]
      }]
    }
  }]
}
```

数组保序——和 questions[] 输入顺序一致，sidecar 翻译时可以索引对位。

`protocol.ts` 的 `buildResumeRequest` 嗅探 `type === "ask_user_answers"` 时跳过 deny-sweep 路径（这不是 deny，pending tool call 该保留 spinner 直到 tool_result 回来）。

### 4.4 UI 规格

#### 4.4.1 Header

```
[ 项目信息 ]                       < 1 of 4 >    ✕
```

- 左：题目 `header` 字段（短标签，截图 18 里的 "(单选测试)..."）
- 中：`< page+1 of N >`，箭头 disabled 在两端
- 右：X 关闭

#### 4.4.2 单选 page (multiSelect=false)

```
1  告诉我项目详情                                          →
   我会提供项目名称、背景和具体内容
─────────────────────────────────────────────
2  先看通用模板
   你先做一个通用框架，我再填充
─────────────────────────────────────────────
3  示范项目参考
   用一个示例项目来展示效果
─────────────────────────────────────────────
✎  Something else
```

- 序号 1-4：等宽方框，可键盘按 1-4 直接选
- focus 态高亮 + 显示右侧 `→`（提示按 Enter 进下一题）
- 选中后 ~150ms 自动 advance（页内反馈先发生，再动画切页）
- 最底"Something else"：点击后行就地变成 textarea + Skip 按钮变 Cancel

#### 4.4.3 多选 page (multiSelect=true)

```
☐  项目背景与目标
   为什么做、解决什么问题
─────────────────────────────────────────────
☐  核心功能亮点
   ...
─────────────────────────────────────────────
☐  Something else

──────────────────────────────────────────
0 selected                           Skip  →
```

- 复选框前缀，选中显示 brand-100 填色
- 底部 footer：左 `N selected` 计数，右 Skip + → 按钮
- → 按钮只在 `N≥1` 时高亮（disabled 灰）
- Skip 永远可点 → 当前题标 skipped → 直接下一页

#### 4.4.4 Something else 行为

点击该行（不管单选多选）：
- 行就地展开 textarea（max 6 行，自动换行，不限字数但 UI 限高）
- 出现 inline Save / Cancel 链接（或直接靠 Enter 确认 / Esc 取消）
- 写入后：单选自动 advance；多选保留在该页继续选
- 已写入 custom 后再点其他普通选项 → 二选一互斥（custom 清空，选项接管）

#### 4.4.5 末页 Send

最后一题（page === N-1）：footer 的 → 按钮文案变 **Send**（brand-100 填色，比单选 `→` 更显眼）。点 Send → flush 全部答案，关闭卡片。

#### 4.4.6 键盘

- `1-9`：选中对应序号选项（单选 = 自动 advance；多选 = toggle）
- `Enter`：单选首次 = 确认 focus 项；末页 = Send
- `←` `→`：翻页（disable 在两端）
- `Esc`：当前题 skip + 翻下一页（末页 skip = flush）
- 标准全局 `Esc → 拒绝 / Enter → 允许` 在 AskUserCard 挂载期间禁用（避免和工具审批的全局快捷键打架）

### 4.5 ChatStream 分流

```tsx
const renderInterruptCard = (it: PendingInterrupt) => {
  if (it.reason === "ask_user") {
    return <AskUserCard interrupt={it} onSubmit={...} onClose={...} />;
  }
  return <ToolApprovalCard interrupt={it} ... />;
};
```

`interruptsByToolId` 仍然按 id 聚合，渲染时按 `reason` 分发。

`allowedTools.has("AskUserQuestion")` 跳过逻辑不适用（AskUserQuestion 永远应该问）——前端在分流前不再 skip。

## 5. Testing

- **单元**：
  - `protocol.test.ts`：`ask_user_answers` decision 不触发 deny-sweep
  - `AskUserCard.test.tsx`：单选自动 advance、多选不 advance、Something else 与选项互斥、X / Send flush 内容
- **集成**：
  - sidecar 收到 `ask_user_answers` payload → 正确翻译成 Anthropic 期望的 `{ answers: {...} }` tool_result

## 6. Rollout / Rollback

- 单 PR 落 sidecar interrupt 分流 + 前端组件 + 协议
- Rollback：删 `reason: "ask_user"` 分支，AskUserQuestion 自动落回 `ToolApprovalCard`（无需删前端目录）

## 7. Future

- 拖拽排序题型（截图 20 的 UI 已经预想了，但 schema 还没有）
- 题目级别的"必答"标记（Anthropic 当前未提供，但可以扩展 `required: true` 让 Skip disable）
- Server 端把 question + selected 写进 messages 表，让 Process Tab 能回溯 agent 问过的题

## 8. 约束回顾

- 不动 Anthropic 官方 skill（`built-in/skills/`）— ✅
- 兼容第三方 Claude Agent SDK — ✅（reason='ask_user' 是 server 自己判断 toolName，所有 SDK 调 AskUserQuestion 都生效）
