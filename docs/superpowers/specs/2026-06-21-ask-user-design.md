# Ask User 功能设计

日期：2026-06-21

## 背景

Agent Studio 已经通过 `@anthropic-ai/claude-agent-sdk` 接入 Claude Code。当前仓库里已有一部分 `AskUserQuestion` 链路：provider 在 `canUseTool` 中识别该工具，`InterruptBus` 有 `requestAskUser` / `resolveAskUser`，前端也有 `src/features/task/ask-user/` 组件。这个设计的目标不是另起一套交互，而是把现有链路收敛为完整、清晰、可测试的 ask-user 功能。

本设计以 Claude Agent SDK 的默认 `AskUserQuestion` 协议为基准。首版不启用 `toolConfig.askUserQuestion.previewFormat`，因此不渲染 `preview`。

## 目标

1. 严格按 SDK 默认协议处理 `AskUserQuestion`。
2. 将 ask-user 和 tool approval 在概念、类型、UI 文案、resolver 上隔离。
3. 复刻官方可确认的 Claude Code ask-user 基线：内联问题卡、header、question、options、single/multi select、Other 自由输入。
4. 复用现有 run interrupt/resume 传输骨架，避免复制 SSE replay、刷新恢复、重启 reconcile 逻辑。
5. 补齐后端、runtime、UI、测试覆盖。

## 非目标

1. 不启用或渲染 `preview` 字段。
2. 不把未验证的交互宣称为 Claude Code 同款，例如数字键选择、左右翻页、Escape 跳过、关闭 X 提交 partial、单选自动前进。
3. 不新增独立 ask-user API 通道。
4. 不把 ask-user 纳入 allowed tools、approval rules、sandbox 或 permission mode 语义。

## SDK 协议

`AskUserQuestion` 输入：

```ts
type AskUserQuestionInput = {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
      preview?: string;
    }>;
    multiSelect: boolean;
  }>;
};
```

输出：

```ts
type AskUserQuestionOutput = {
  questions: AskUserQuestionInput["questions"];
  answers: Record<string, string>;
};
```

答案转换规则：

1. 单选：`answers[question] = selectedLabel`
2. 多选：`answers[question] = selectedLabels.join(",")`
3. Other 自由输入：`answers[question] = customText`
4. 跳过：`answers[question] = ""`

`question` 是答案 map 的 key，不能改写。

## 架构

底层复用现有 interrupt/resume 骨架，但把状态语义从 approval 中解耦。run 的人工等待状态应改为中性的 `awaiting_user`，具体原因由 interrupt 的 `reason` 表达：

1. `tool_approval`：权限审批，resume decision 是 `allow` / `deny`。
2. `ask_user`：信息补全，resume decision 是 `ask_user_answers`。

这两个概念共享“暂停 run、等待用户、恢复 run”的传输机制，但不共享 domain API、payload、文案或 resolver。

### 后端边界

`sidecar/src/agui/provider-claude/provider.ts` 在 `canUseTool` 中特殊处理 `toolName === "AskUserQuestion"`：

1. 不走 workspace sandbox。
2. 不受 `permissionMode: "act-without-asking"` 跳过。
3. 不匹配 approval rules 或 allowed tools。
4. 校验 `input.questions` 是数组；非法输入放行给 SDK 内置工具处理错误。
5. 合法输入调用 `interruptBus.requestAskUser()`。
6. `resolveAskUser()` 返回后，把 `answers` 写入 `updatedInput`，让 SDK 内置工具继续产出标准 output。

`InterruptBus` 保持 `requestApproval` / `requestAskUser` 和 `resolve` / `resolveAskUser` 两组方法分离，避免 resolver 类型串线。

### Run 状态

store 状态新增或迁移到 `awaiting_user`。旧的 `awaiting_approval` 应兼容读取，避免已有 DB、测试数据、旧事件导致恢复失败。

前端 runtime 可以派生更细状态：

1. `awaiting_tool_approval`
2. `awaiting_user_input`

UI 文案根据 interrupt reason 展示，不再把 ask-user 称为 approval。

## 数据流

1. Claude 调用 `AskUserQuestion`。
2. provider 在 `canUseTool` 中识别该工具，并调用 `bus.requestAskUser({ runId, threadId, toolUseID, questions })`。
3. bus append `RUN_FINISHED(outcome: "interrupt")`，interrupt 为 `{ id, reason: "ask_user", payload: { toolName: "AskUserQuestion", questions } }`。
4. store 把 run 标记为 `awaiting_user`。
5. 前端 runtime 收到 interrupt，填充 `pendingInterrupts`。
6. `ChatStream` 根据 `reason === "ask_user"` 渲染 `AskUserCard`。
7. 用户提交后，前端向 `/runs/:runId/resume` 发送 `ask_user_answers` decision。
8. route 把数组答案转换成 SDK 需要的 `Record<string, string>`。
9. route 调用 `interruptBus.resolveAskUser()`，成功后把 run 标记回 `running`。
10. provider 的 `canUseTool` Promise 被唤醒，返回 `{ behavior: "allow", updatedInput: { ...input, answers } }`。
11. SDK 内置工具产出 `AskUserQuestionOutput`，模型继续同一个 run。

## 前端 UI

`AskUserCard` 是独立 ask-user 组件，不复用 `ToolApprovalCard`。它出现在 assistant 当前回合内，作为内联问题卡展示，不使用 modal。

必须支持：

1. 短 `header` 展示。
2. 完整 `question` 展示。
3. 单选 options。
4. 多选 options。
5. 每个 option 展示 `label` 和 `description`。
6. Other / Something else 自由输入。
7. 提交后禁用，防止重复 resume。
8. 缺字段安全降级，不让 UI crash。

不作为同款承诺的增强：

1. 数字键选择。
2. 左右箭头翻页。
3. Escape 跳过。
4. 关闭 X 提交 partial。
5. 单选自动前进。

如果保留这些增强，代码注释和测试应明确它们是 Agent Studio 自己的体验增强，而不是 Claude Code 同款要求。若实施目标选择“最严格复刻”，这些增强应关闭或等待实际 Claude Code 对照验证。

样式必须遵守本仓库 design tokens 规则，不在 `src/features/` 中硬编码 hex/raw HSL。圆角、边框、背景、hover、brand action 都从现有 token 获取。ask-user 文案不得出现 approval / approve / deny。

## 错误处理

1. `AskUserQuestion` 输入非法：provider 放行给 SDK 内置工具处理错误。
2. `/resume` body 缺少 interrupt id、payload 或 decision：返回 `400`。
3. stale resume：保持幂等，不把已终止 run 重新标记为 running。
4. sidecar 重启导致 deferred 丢失：reconcile 为 cancelled/process_restart，并使用中性文案提示可继续上次任务。
5. 空 `questions`：前端不渲染空卡，后端尽量交由 SDK 协议处理。

## 测试计划

### Sidecar

1. provider：`AskUserQuestion` 在 `act-without-asking` 下仍触发 `requestAskUser`。
2. provider：普通工具仍按 sandbox、approval rules、tool approval 路径处理。
3. interrupt bus：`requestAskUser` 写入 `reason: "ask_user"`，run 状态为 `awaiting_user`。
4. interrupt bus：approval resolver 和 ask-user resolver 互不串线。
5. resume route：单选、多选、custom、skipped 正确转成 `Record<string, string>`。
6. resume route：stale ask-user resume 幂等。
7. store：`awaiting_user` 可作为 active run 返回。
8. store：兼容旧 `awaiting_approval`。

### Runtime

1. `RUN_FINISHED(outcome:"interrupt")` 能恢复 ask-user pending interrupt。
2. 非 interrupt 终态会清掉 stale pending interrupt。
3. `useRunStatus` 或等价派生状态能区分 tool approval 与 ask-user。

### UI

1. 单选提交 label。
2. 多选提交 label 数组。
3. Other 提交 custom text。
4. skipped 提交 skipped entry。
5. submitted 后按钮禁用，不重复调用 `onSubmit`。
6. ask-user 卡和状态文案不出现 approval/approve/deny。
7. 缺失 option description 或异常 payload 不 crash。

### 集成

模拟 SDK 调用 `AskUserQuestion`，用户提交答案后 run 从 `awaiting_user` 回到 `running`，随后继续接收后续事件。

## 迁移与兼容

1. DB/status 类型新增 `awaiting_user` 后，读取路径兼容 `awaiting_approval`。
2. 前端原有 `pendingInterrupts.length > 0` 的 gating 可保留，但文案和派生状态必须按 reason 分流。
3. 旧注释、变量名、测试描述中把 ask-user 称为 approval 的地方需要改为中性表述。
4. 如果已有历史 run 使用 `awaiting_approval + reason:"ask_user"`，前端仍应能恢复并渲染 ask-user 卡。

## 验收标准

1. Ask-user 和 tool approval 在 UI、文案、resolver、测试里清晰隔离。
2. `AskUserQuestion` 不受 permission mode 或 approval rules 影响。
3. 用户提交答案后 Claude run 能继续，并收到 SDK 标准 `answers` map。
4. 刷新后仍能恢复 ask-user 卡。
5. 重启 orphan 情况不会展示 approval 专属文案。
6. 所有新增/调整测试通过。
