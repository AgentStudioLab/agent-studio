import type { newTask as Zh } from "../zh/newTask";

export const newTask: typeof Zh = {
  newTask: {
    welcome: {
      heading: "Let's knock something off your list",
      learnMore: "Learn how to use Agent Studio safely.",
    },
    input: {
      placeholder: "How can I help you today?",
      workInProject: "Work in a project",
      ask: "Ask",
      legacyModel: "Legacy Model",
    },
    workInProject: {
      chooseFolder: "Choose a different folder",
      pickerTitle: "Choose working directory for this conversation",
    },
    error: {
      apiKeyMissing: "API key not configured. Add it in Settings.",
      generic: "Submit failed: {{msg}}",
    },
  },
};
