import type { MockTask } from "./types";

export const inactiveProjectsTask: MockTask = {
  id: "task-inactive-projects",
  title: "扫描 ~/Workspace 找出不活跃项目，生成 xlsx + pptx 报表",
  status: "running",
  elapsedSeconds: 133,
  plan: [
    { id: "p1", status: "done", description: "扫描 ~/Workspace 目录" },
    { id: "p2", status: "done", description: "按最后 git commit 时间排序" },
    { id: "p3", status: "active", description: "生成 xlsx 报表", detail: "scanning 9 / 14 …" },
    { id: "p4", status: "pending", description: "生成 pptx 摘要" },
  ],
  messages: [
    // ---------- Round 1 ----------
    {
      id: "m1-user",
      from: "user",
      blocks: [{ type: "text", text: "生成以后 excel 电子表格 demo" }],
    },
    {
      id: "m1-assistant",
      from: "assistant",
      blocks: [
        { type: "preset-question", q: "您想要怎样的 Excel demo？", a: "项目清理报表" },
        {
          type: "tool-call-timeline",
          summary: "Ran 4 commands, used a skill, read a file",
          defaultOpen: true,
          steps: [
            { icon: "wrench", title: "Running skill", chip: "Result" },
            { icon: "file", title: "Read xlsx-spec.md" },
            { icon: "terminal", title: "Running command", chip: "Script" },
            {
              icon: "agent-run",
              title: "Visual QA on cells",
              subSteps: [
                { icon: "book-open", title: "Reading 概览 sheet" },
                { icon: "book-open", title: "Reading 不活跃项目 sheet" },
                { icon: "book-open", title: "Reading 清理详情 sheet" },
                { icon: "book-open", title: "Reading 空间释放图表 sheet" },
              ],
            },
            {
              icon: "terminal",
              title: "Running command",
              chip: "Script",
              chipVariant: "danger",
            },
          ],
        },
        {
          type: "prose",
          html: `
            <p>报表生成完成, 28 条公式全部正确计算, 零错误。</p>
            <p><a href="#" class="underline underline-offset-4" style="color: hsl(var(--text-100)); text-decoration-color: hsl(var(--text-400) / 0.6);">查看报表</a></p>
            <p>工作簿包含 4 个工作表:</p>
            <ul class="list-disc pl-6 space-y-1.5" style="--tw-prose-bullets: hsl(var(--text-400));">
              <li><strong class="font-semibold">概览</strong> — 4 个关键指标卡片</li>
              <li><strong class="font-semibold">不活跃项目</strong> — 7 个 90 天未更新的项目清单</li>
              <li><strong class="font-semibold">清理详情</strong> — 17 个已删除依赖/构建目录</li>
              <li><strong class="font-semibold">空间释放图表</strong> — 按项目汇总 (SUMIF 公式)</li>
            </ul>
            <p>所有合计、平均值、占比都用 Excel 公式实现, 源数据修改后会自动重算。</p>
          `,
        },
        {
          type: "artifact",
          name: "项目清理报告",
          kind: "Spreadsheet",
          ext: "XLSX",
          opener: "wpsoffice",
        },
        { type: "message-actions" },
      ],
    },

    // ---------- Round 2 ----------
    {
      id: "m2-user",
      from: "user",
      blocks: [
        {
          type: "text",
          text: "把“不活跃项目”那张表加一列「清理建议」,分三档:立即清理 / 待评估 / 保留",
        },
      ],
    },
    {
      id: "m2-assistant",
      from: "assistant",
      blocks: [
        {
          type: "prose",
          html: `
            <p>好, 已加。基于<strong class="font-semibold">最后活动时间 + 依赖体积 + 是否有 README</strong> 三维打分:</p>
            <ul class="list-disc pl-6 space-y-1.5">
              <li><strong class="font-semibold" style="color: hsl(var(--danger-100));">立即清理</strong> — 闲置 ≥ 180 天 + 无 README + 依赖目录可重建。共 <strong>4</strong> 个项目, 预计释放 <strong>2.8 GB</strong>。</li>
              <li><strong class="font-semibold" style="color: hsl(var(--warning-100));">待评估</strong> — 闲置 90-180 天, 或有非标准结构。共 <strong>3</strong> 个项目, 需手动确认。</li>
              <li><strong class="font-semibold" style="color: hsl(var(--success-100));">保留</strong> — 近 30 天内有 commit, 或有 active branch。<strong>不建议删除</strong>。</li>
            </ul>
            <p>报表已更新 (v2 · 28 条公式 → 31 条公式, 新增 SUMIFS 按建议分类汇总)。</p>
          `,
        },
        {
          type: "artifact",
          name: "项目清理报告 v2",
          kind: "Spreadsheet",
          ext: "XLSX",
          opener: "wpsoffice",
        },
        { type: "message-actions" },
      ],
    },

    // ---------- Round 3 ----------
    {
      id: "m3-user",
      from: "user",
      blocks: [{ type: "text", text: "再生成一份对应的 PPT 给 review 会议用,深色科技风" }],
    },
    {
      id: "m3-assistant",
      from: "assistant",
      blocks: [
        { type: "prose", html: `<p>Now let me convert to images for visual QA:</p>` },
        {
          type: "tool-call-timeline",
          summary: "Ran a command, ran an agent",
          defaultOpen: false,
          steps: [
            { icon: "terminal", title: "Running command", chip: "Script" },
            {
              icon: "agent-run",
              title: "Visual QA on PPT slides",
              subSteps: [
                { icon: "book-open", title: "Reading slide 1 · 封面" },
                { icon: "book-open", title: "Reading slide 2 · 执行摘要" },
                { icon: "book-open", title: "Reading slide 3 · 不活跃项目清单" },
                { icon: "book-open", title: "Reading slide 4 · 清理范围与保留" },
                { icon: "book-open", title: "Reading slide 5 · 空间释放分布" },
                { icon: "book-open", title: "Reading slide 6 · 依赖目录清理明细" },
                { icon: "book-open", title: "Reading slide 7 · 后续建议" },
              ],
            },
          ],
        },
        { type: "prose", html: `<p>I'll fix the visible defects:</p>` },
        {
          type: "tool-call-timeline",
          summary: "Edited 4 files",
          defaultOpen: false,
          steps: [
            { icon: "file", title: "Edited slide_05.tsx", chip: "+12 / -8" },
            { icon: "file", title: "Edited slide_06.tsx", chip: "+8 / -4" },
            { icon: "file", title: "Edited slide_07.tsx", chip: "+3 / -2" },
            { icon: "file", title: "Edited theme.css", chip: "+5" },
          ],
        },
        {
          type: "prose",
          html: `<p>Now fix slide 5 ("4.27 GB" right margin) and slide 6 (table row height) and slide 7 (banner position):</p>`,
        },
        {
          type: "tool-call-timeline",
          summary: "Edited 6 files, read 5 files, ran 3 commands",
          defaultOpen: false,
          steps: [
            { icon: "file", title: "Edited slide_05.tsx", chip: "+4 / -3" },
            { icon: "file", title: "Edited slide_06.tsx", chip: "+6 / -5" },
            { icon: "terminal", title: "Running command", chip: "Build" },
            {
              icon: "agent-run",
              title: "Re-render QA",
              subSteps: [
                { icon: "book-open", title: "Verified slide 5" },
                { icon: "book-open", title: "Verified slide 6" },
                { icon: "book-open", title: "Verified slide 7" },
              ],
            },
          ],
        },
        {
          type: "prose",
          html: `
            <p>PPT 制作完成, 深色科技风, 共 <strong>7 页</strong>, 已通过视觉 QA 修正所有可见问题。</p>
            <p><a href="#" class="underline underline-offset-4" style="color: hsl(var(--text-100)); text-decoration-color: hsl(var(--text-400) / 0.6);">查看 PPT</a></p>
            <p>页面结构:</p>
            <ol class="list-decimal pl-6 space-y-1">
              <li><strong class="font-semibold">封面</strong> — 标题 + 装饰圆形点缀 + 元信息行</li>
              <li><strong class="font-semibold">执行摘要</strong> — 4 个 KPI 卡片 (19 / 7 / 17 / 4.3 GB) + 3 个关键发现</li>
              <li><strong class="font-semibold">不活跃项目清单</strong> — 7 项目表格 + 闲置天数横向进度条</li>
              <li><strong class="font-semibold">清理范围与保留</strong> — 两列对比 (已清理 vs 完整保留)</li>
              <li><strong class="font-semibold">空间释放分布</strong> — 自绘条形图 + 右侧汇总卡 ("4.27 GB" 大字)</li>
              <li><strong class="font-semibold">依赖目录清理明细</strong> — 17 行详细表格 + 合计行</li>
              <li><strong class="font-semibold">后续建议</strong> — 三步路径卡 (RESTORE / ARCHIVE / AUTOMATE) + 结束语</li>
            </ol>
          `,
        },
        {
          type: "artifact",
          name: "项目清理报告",
          kind: "Presentation",
          ext: "PPTX",
          opener: "wpsoffice",
        },
        { type: "message-actions" },
        { type: "brand-star", size: 20, spin: true },
      ],
    },
  ],
};

export function makeMockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    ...inactiveProjectsTask,
    ...overrides,
    plan: overrides.plan ?? inactiveProjectsTask.plan,
    messages: overrides.messages ?? inactiveProjectsTask.messages,
  };
}
