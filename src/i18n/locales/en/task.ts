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
    processTab: {
      plan: "Plan",
      countOf: "{{done}} of {{total}}",
      elapsed: "{{time}} elapsed",
      status: {
        running: "Task running",
        done: "Task complete",
        failed: "Task failed",
        paused: "Task paused",
      },
    },
    filesTab: {
      fileCount: "{{count}} files",
      newBadge: "new",
      addFiles: "Add files to working tree",
    },
    contextTab: {
      skills: "Skills",
      skillsLoaded: "{{count}} loaded",
      mcpServers: "MCP servers",
      mcpOnCount: "{{on}} / {{total}} on",
      off: "off",
      connected: "connected",
      disconnected: "disconnected",
    },
    preview: {
      refresh: "Refresh",
      close: "Close",
      resizeHandle: "Resize preview pane",
      notImplemented: "[Preview for .{{type}} not implemented in this mock]",
      fileLabel: {
        markdown: "Markdown",
        spreadsheet: "XLSX",
        presentation: "PPTX",
        code: "Code",
        image: "Image",
        generic: "File",
      },
      slides: {
        overview: {
          title: "Scan overview",
          subtitle: "5 inactive projects",
        },
        top3: {
          title: "Top 3",
          subtitle: "old-project-1 / old-project-2 / archive-x",
        },
        suggestion: {
          title: "Suggestion",
          subtitle: "Archive 4 · Delete 1",
        },
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
    },
  },
};
