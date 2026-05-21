import type { settings as Zh } from "../zh/settings";

export const settings: typeof Zh = {
  settings: {
    title: "Settings",
    nav: {
      general: "General",
    },
    profile: {
      title: "Profile",
      fullName: "Full name",
      callMe: "What should Agent Studio call you?",
      callMePlaceholder: "Jay",
      work: "What best describes your work?",
      workOptions: {
        engineer: "Software engineer",
        designer: "Designer",
        pm: "Product manager",
        researcher: "Researcher",
        writer: "Writer",
        operations: "Operations / Business",
        other: "Other",
      },
      instructions: "Instructions for Agent Studio",
      instructionsHint:
        "Agent Studio will keep these in mind across chats and Cowork within Anthropic's guidelines.",
      instructionsLearnMore: "Learn more",
      instructionsPlaceholder:
        "e.g. ask clarifying questions before giving detailed answers",
    },
    appearance: {
      title: "Appearance",
      theme: "Theme",
      themeSystem: "System",
      themeLight: "Light",
      themeDark: "Dark",
      language: "Language",
      languageZh: "中文",
      languageEn: "English",
    },
    apiKey: {
      title: "Anthropic API Key",
      description: "Required for Agent Studio to call the model. Stored locally in plugin-store (plaintext).",
      placeholder: "sk-ant-...",
      save: "Save",
      saved: "Saved",
      saveError: "Save failed",
    },
    back: "Back",
  },
};
