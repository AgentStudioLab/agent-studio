import type { projectDetail as Zh } from "../zh/projectDetail";

export const projectDetail: typeof Zh = {
  projectDetail: {
    pin: "Pin",
    more: "More",
    promptPlaceholder: "What would you like to work on in this project?",
    ask: "Ask",
    legacyModel: "Legacy Model",
    recents: "Recents",
    context: "Context",
    sections: {
      instructions: "Instructions",
      scheduled: "Scheduled",
      memory: "Memory",
      computerContext: "On your computer",
    },
    actions: {
      edit: "Edit",
      add: "Add",
    },
    empty: {
      instructions: "No instructions yet.",
      scheduled: "No scheduled tasks yet.",
      memory: "No memory entries.",
      computerContext: "No folders added.",
    },
    frequency: {
      manual: "Manual",
      hourly: "Hourly",
      daily: "Daily",
      weekdays: "Weekdays",
      weekly: "Weekly",
    },
  },
};
