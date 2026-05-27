import type { composer as Zh } from "../zh/composer";

export const composer: typeof Zh = {
  composer: {
    input: {
      placeholder: "What would you like to know?",
    },
    slash: {
      empty: "No matching skills",
      kindLabel: "Skill",
    },
  },
};
