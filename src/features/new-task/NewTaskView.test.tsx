import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

const shellOpen = mock(async (_url: string) => {});
const setPendingFirstPrompt = mock(() => {});

mock.module("@tauri-apps/plugin-dialog", () => ({
  open: mock(async () => null),
}));

mock.module("@tauri-apps/plugin-shell", () => ({ open: shellOpen }));

mock.module("@/app/AppShell", () => ({
  AppShell: ({ main }: { main: ReactNode }) => <>{main}</>,
}));

mock.module("@/app/AppShellContext", () => ({
  useAppShell: () => ({ setPendingFirstPrompt }),
}));

mock.module("@/lib/data/conversations", () => ({
  createConversation: mock(async () => ({ id: "conversation-1" })),
}));

mock.module("@/lib/data/queries", () => ({
  queryKeys: { recents: ["recents"] },
}));

mock.module("@/lib/agui/react/useChat", () => ({
  threadStatusKey: ["thread-status"],
}));

mock.module("@/features/auth/useAuth", () => ({
  useAuth: () => ({
    status: "signed_out",
    getValidAccessToken: mock(async () => {
      throw new Error("not_signed_in");
    }),
  }),
}));

mock.module("@/lib/data/settings", () => ({
  getProvider: mock(async () => ({ defaultSelection: null })),
}));

mock.module("@/features/composer/SlashEditor", () => ({
  SlashEditor: ({ placeholder }: { placeholder?: string }) => (
    <textarea aria-label={placeholder ?? "message"} name="message" />
  ),
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "newTask.defaultTitle": "New task",
        "newTask.welcome.heading": "Let Agent Studio move work forward on this desktop.",
        "newTask.welcome.subtitle": "Choose a project folder, describe the goal, and I will use local tools to move the work forward in your workspace.",
        "newTask.welcome.learnMore": "Read the local safety guide",
        "newTask.input.placeholder": "How can I help you today?",
        "newTask.input.workInProject": "Work in a project",
        "newTask.input.permissionMode.askShort": "Ask",
        "newTask.input.permissionMode.actShort": "Act without asking",
        "newTask.input.permissionMode.askTitle": "Ask before acting",
        "newTask.input.permissionMode.askDesc": "Agent pauses for approval.",
        "newTask.input.permissionMode.actTitle": "Act without asking",
        "newTask.input.permissionMode.actDesc": "Agent runs all actions.",
        "newTask.input.permissionMode.confirmTitle": "Act without asking?",
        "newTask.input.permissionMode.confirmDesc": "Agent will run all actions.",
        "newTask.input.permissionMode.cancel": "Cancel",
        "newTask.input.permissionMode.confirm": "Enable",
        "newTask.workInProject.pickerTitle": "Choose working directory",
        "newTask.workInProject.chooseFolder": "Choose a different folder",
        "newTask.error.apiKeyMissing": "API key not configured.",
        "newTask.error.generic": "Submit failed: {{msg}}",
      };
      return translations[key] ?? key;
    },
  }),
}));

const { NewTaskView } = require("./NewTaskView") as typeof import("./NewTaskView");

function TestModelPicker() {
  return <button type="button">Model</button>;
}

function renderNewTaskView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <NewTaskView ModelPicker={TestModelPicker} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  shellOpen.mockClear();
  setPendingFirstPrompt.mockClear();
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  mock.restore();
});

describe("NewTaskView", () => {
  it("renders the welcome heading statically without typewriter chrome", () => {
    const { container } = renderNewTaskView();

    const heading = screen.getByRole("heading", {
      name: "Let Agent Studio move work forward on this desktop.",
    });

    expect(heading).toBeDefined();
    expect(heading.className).toContain("mt-2");
    expect(container.querySelector(".typewriter-caret")).toBeNull();
  });

  it("keeps the supporting copy and safety guide link on one line", () => {
    renderNewTaskView();

    const subtitle = screen.getByText(
      "Choose a project folder, describe the goal, and I will use local tools to move the work forward in your workspace.",
    );
    const safetyGuide = screen.getByRole("button", {
      name: "Read the local safety guide",
    });

    expect(subtitle.className).toContain("whitespace-nowrap");
    expect(safetyGuide.className).toContain("whitespace-nowrap");
  });

  it("renders the safety docs link below the prompt input", () => {
    renderNewTaskView();

    const promptInput = screen
      .getByLabelText("How can I help you today?")
      .closest("form");
    const docsText = screen.getByText("Read the local safety guide");
    const docsControl = docsText.closest("a,button");

    expect(promptInput).not.toBeNull();
    expect(docsControl).not.toBeNull();
    expect(
      Boolean(
        promptInput!.compareDocumentPosition(docsControl!) &
          document.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it("opens the safety docs in the system browser", () => {
    renderNewTaskView();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Read the local safety guide",
      }),
    );

    expect(shellOpen).toHaveBeenCalledWith("https://www.agentstudio.chat/docs");
  });
});
