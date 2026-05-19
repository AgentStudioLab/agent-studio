import type { sidebar as Zh } from "../zh/sidebar";

export const sidebar: typeof Zh = {
  sidebar: {
    nav: {
      newTask: "New task",
      projects: "Projects",
      scheduled: "Scheduled",
      customize: "Customize",
      settings: "Settings",
    },
    sections: {
      pinned: "Pinned",
      recents: "Recents",
    },
    contextMenu: {
      moreActions: "More actions",
      moveToProject: "Move to project",
      pin: "Pin",
      unpin: "Unpin",
      rename: "Rename",
      archive: "Archive",
      delete: "Delete",
    },
    toggle: {
      open: "Open sidebar",
      collapse: "Collapse sidebar",
    },
    search: {
      ariaLabel: "Search (Cmd+K)",
      dialogTitle: "Search ⌘K",
      dialogDescription: "Search across tasks, projects, and recents (coming soon).",
      ok: "OK",
    },
    user: {
      settings: "Settings",
      logout: "Logout",
    },
    update: {
      title: "Relaunch to update",
    },
  },
};
