import type { task as Zh } from "../zh/task";

export const task: typeof Zh = {
  task: {
    header: {
      menu: "Task menu",
      schedule: "Schedule",
      turnIntoSkill: "Turn into skill",
      moveToProject: "Move to project",
      pin: "Pin",
      rename: "Rename",
      archive: "Archive",
      delete: "Delete",
      stop: "Stop",
      toggleRightPanel: "Toggle right panel",
    },
    tabs: {
      process: "Process",
      files: "Files",
      context: "Context",
    },
    rightPanel: {
      empty: "No artifacts yet",
    },
    processTab: {
      plan: "Plan",
      activity: "Activity",
      countOf: "{{done}} of {{total}}",
      elapsed: "{{time}} elapsed",
      empty: {
        notStarted: "Waiting for agent to share a plan…",
      },
      status: {
        running: "Task running",
        done: "Task complete",
        failed: "Task failed",
        paused: "Task paused",
      },
      phases: {
        progress: "Progress",
        context: {
          label: "Gather context",
          empty: "No reads yet",
          summary: "{{count}} reads",
        },
        plan: {
          label: "Plan steps",
          empty: "No plan emitted",
          thinking: "Thinking…",
          summary: "{{count}} updates",
        },
        execute: {
          label: "Execute",
          empty: "No actions yet",
          summary: "{{count}} actions",
        },
        finish: {
          label: "Wrap up",
          waiting: "Awaiting completion",
          done: "Done",
        },
      },
    },
    filesTab: {
      fileCount: "{{count}} files",
      newBadge: "new",
      empty: "Agent hasn't touched any files yet",
    },
    contextTab: {
      skills: "Skills",
      skillsLoaded: "{{count}} loaded",
      mcpServers: "MCP servers",
      mcpOnCount: "{{on}} / {{total}} on",
      off: "off",
      connected: "connected",
      disconnected: "disconnected",
      empty: {
        notStarted: "Waiting for agent to start…",
        noCapabilities: "No skills or MCP servers loaded",
        goToCustomize: "Open Customize",
      },
    },
    preview: {
      refresh: "Refresh",
      close: "Close",
      resizeHandle: "Resize preview pane",
      loading: "Loading…",
      errorNotFound: "File not found",
      errorOutsideWorkspace: "File is outside the working directory",
      errorTooLarge: "File exceeds 2 MiB; cannot preview",
      errorReadFailed: "Read failed: {{detail}}",
      binaryNotice: "Binary file — cannot preview in app",
      openExternal: "Open in system default",
      fileLabel: {
        markdown: "Markdown",
        spreadsheet: "XLSX",
        presentation: "PPTX",
        code: "Code",
        image: "Image",
        generic: "File",
      },
    },
    timeline: {
      done: "Done",
      stepsCount: "{{count}} steps",
    },
    messageActions: {
      copy: "Copy",
      thumbsUp: "Thumbs up",
      thumbsDown: "Thumbs down",
    },
    input: {
      placeholder: "Write a message...",
      ask: "Ask",
      legacyModel: "Legacy Model",
      disclaimer:
        "Agent Studio is AI and can make mistakes. Please double-check responses.",
      models: {
        opus: { displayName: "Opus 4.7", description: "Most capable for ambitious work" },
        sonnet: { displayName: "Sonnet 4.6", description: "Responsive everyday work" },
        haiku: { displayName: "Haiku 4.5", description: "Fastest, most efficient" },
      },
      permissionMode: {
        askShort: "Ask",
        actShort: "Auto",
        askTitle: "Ask before acting",
        askDesc: "Agent pauses so you can approve each action.",
        actTitle: "Act without asking",
        actDesc: "Agent works without pausing for approval.",
        confirmTitle: "Act without asking?",
        confirmDesc:
          "Agent will work without pausing for approval. This can put your data or system at risk.",
        cancel: "Cancel",
        confirm: "Yes, continue",
      },
    },
    error: {
      authFailed: "API key invalid or missing",
      configureKey: "Configure API key",
      rateLimit: "Rate limited — retrying in {{sec}}s",
      generic: "Agent error: {{msg}}",
      maxTurns: "Hit max turns — please start a new thread",
      maxBudget: "Hit cost cap",
    },
    retry: {
      attempt: "Retrying {{attempt}}/{{max}}",
    },
    toolsPanel: {
      title: "Tools",
      followGlobal: "Following global default",
      customize: "Customize for this thread",
      restore: "Reset to global default",
    },
  },
};
