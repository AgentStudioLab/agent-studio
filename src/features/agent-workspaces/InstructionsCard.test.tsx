import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

let instructions = "";
let agentSource: "user" | "builtin" = "user";

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "agentSpace.instructions.title": "Instructions",
        "agentSpace.instructions.description": "Acts as this agent's CLAUDE.md.",
        "agentSpace.instructions.edit": "Edit",
        "agentSpace.instructions.editTitle": "Edit instructions",
        "agentSpace.instructions.editPlaceholder": "Write instructions...",
        "agentSpace.instructions.cancel": "Cancel",
        "agentSpace.instructions.save": "Save",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("@/lib/data/agent-instruction-queries", () => ({
  useAgentInstructions: () => ({ data: instructions }),
  useSaveAgentInstructionsMutation: () => ({
    isPending: false,
    mutate: mock(() => {}),
  }),
}));

mock.module("@/lib/data/agent-queries", () => ({
  useAgentWorkspace: () => ({ data: { source: agentSource } }),
}));

mock.module("./RailSection", () => ({
  RailSection: ({
    title,
    action,
    children,
  }: {
    title: ReactNode;
    action?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {action}
      {children}
    </section>
  ),
}));

const { InstructionsCard } = require("./InstructionsCard") as typeof import("./InstructionsCard");

afterEach(() => {
  cleanup();
  instructions = "";
  agentSource = "user";
});

describe("InstructionsCard", () => {
  it("keeps long instructions inside a capped scroll region", () => {
    instructions = Array.from({ length: 24 }, (_, index) => `Line ${index + 1}`).join("\n");

    render(<InstructionsCard agentId="agent-1" />);

    const preview = screen.getByRole("region", { name: "Instructions" });
    expect(preview.textContent).toContain("Line 24");
    expect(preview.className).toContain("max-h-56");
    expect(preview.className).toContain("overflow-y-auto");
    expect(preview.className).toContain("overflow-x-hidden");
    expect(preview.tabIndex).toBe(0);
    expect(preview.querySelector("p")?.className).toContain("break-words");
  });

  it("shows the edit action for a user agent", () => {
    instructions = "hi";
    render(<InstructionsCard agentId="agent-1" />);
    expect(screen.queryByLabelText("Edit")).not.toBeNull();
  });

  it("hides the edit action for a builtin (read-only) agent", () => {
    instructions = "hi";
    agentSource = "builtin";
    render(<InstructionsCard agentId="agent-1" />);
    expect(screen.queryByLabelText("Edit")).toBeNull();
  });
});
