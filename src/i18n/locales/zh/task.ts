export const task = {
  task: {
    header: {
      menu: "任务菜单",
      schedule: "定时运行",
      turnIntoSkill: "转为技能",
      moveToProject: "移到项目",
      pin: "置顶",
      rename: "重命名",
      archive: "归档",
      delete: "删除",
      stop: "停止",
      toggleRightPanel: "切换右侧面板",
    },
    tabs: {
      process: "过程",
      files: "文件",
      context: "上下文",
    },
    rightPanel: {
      empty: "暂无产出",
    },
    processTab: {
      plan: "计划",
      countOf: "{{done}} / {{total}}",
      elapsed: "已用 {{time}}",
      empty: {
        notStarted: "等待 agent 制定计划…",
      },
      status: {
        running: "任务运行中",
        done: "任务完成",
        failed: "任务失败",
        paused: "任务已暂停",
      },
    },
    filesTab: {
      fileCount: "{{count}} 个文件",
      newBadge: "新",
      empty: "agent 还没读写文件",
    },
    contextTab: {
      skills: "技能",
      skillsLoaded: "已加载 {{count}}",
      mcpServers: "MCP 服务器",
      mcpOnCount: "{{on}} / {{total}} 已开启",
      off: "未开启",
      connected: "已连接",
      disconnected: "未连接",
      empty: {
        notStarted: "等待 agent 启动…",
        noCapabilities: "未加载任何 skill 或 MCP server",
        goToCustomize: "前往自定义",
      },
    },
    preview: {
      refresh: "刷新",
      close: "关闭",
      resizeHandle: "调整预览面板大小",
      notImplemented: "[此 mock 中未实现 .{{type}} 的预览]",
      fileLabel: {
        markdown: "Markdown",
        spreadsheet: "XLSX",
        presentation: "PPTX",
        code: "代码",
        image: "图片",
        generic: "文件",
      },
      slides: {
        overview: {
          title: "扫描概览",
          subtitle: "5 个不活跃项目",
        },
        top3: {
          title: "Top 3",
          subtitle: "old-project-1 / old-project-2 / archive-x",
        },
        suggestion: {
          title: "建议",
          subtitle: "归档 4 个 · 删除 1 个",
        },
      },
    },
    timeline: {
      done: "完成",
      stepsCount: "{{count}} 步",
    },
    messageActions: {
      copy: "复制",
      thumbsUp: "赞",
      thumbsDown: "踩",
    },
    input: {
      placeholder: "输入消息……",
      ask: "提问",
      legacyModel: "Legacy 模型",
      disclaimer: "Agent Studio 是 AI，可能会出错。请仔细核对回复。",
      models: {
        opus: { displayName: "Opus 4.7", description: "最强能力，应对硬核任务" },
        sonnet: { displayName: "Sonnet 4.6", description: "响应迅速的日常工作" },
        haiku: { displayName: "Haiku 4.5", description: "最快、最经济" },
      },
      permissionMode: {
        askShort: "提问",
        actShort: "直接执行",
        askTitle: "执行前提问",
        askDesc: "agent 会暂停以等待你审批每一个动作。",
        actTitle: "无需审批直接执行",
        actDesc: "agent 不会暂停审批，直接执行所有动作。",
        confirmTitle: "无需审批直接执行？",
        confirmDesc:
          "agent 将无需审批直接执行所有动作。这可能将你的数据或系统置于风险之中。",
        cancel: "取消",
        confirm: "确认开启",
      },
    },
    error: {
      authFailed: "API key 失效或未配置",
      configureKey: "配置 API key",
      rateLimit: "已被限流，{{sec}} 秒后自动重试",
      generic: "agent 错误：{{msg}}",
      maxTurns: "达到最大轮次上限，请新开 thread",
      maxBudget: "达到费用上限",
    },
    retry: {
      attempt: "正在重试 {{attempt}}/{{max}}",
    },
    toolsPanel: {
      title: "工具集",
      followGlobal: "跟随全局默认",
      customize: "为此对话自定义",
      restore: "恢复全局默认",
    },
  },
};
