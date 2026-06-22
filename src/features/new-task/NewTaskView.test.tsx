import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { MemoryRouter } from "react-router-dom";

const shellOpen = mock(async (_url: string) => {});
const setPendingFirstPrompt = mock(() => {});
const createConversationRequests: RequestInit[] = [];

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

mock.module("@/lib/sidecar-client", () => ({
  fetchSidecar: mock(async () => new Response(null, { status: 204 })),
  getSidecarInfo: mock(async () => ({ port: 0, token: "test-token" })),
  authedFetch: mock(async (path: string, init?: RequestInit) => {
    if (path === "/conversations" && init?.method === "POST") {
      createConversationRequests.push(init);
      return new Response(JSON.stringify({ id: "conversation-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "unhandled" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }),
}));

mock.module("@/components/ai-elements/prompt-input", () => ({
  PromptInput: ({
    children,
    onSubmit,
  }: {
    children: ReactNode;
    onSubmit: (message: { text: string; files: unknown[] }) => void | Promise<void>;
  }) => {
    const [text, setText] = useState("");
    return (
      <form
        onChange={(event) => {
          const target = event.target;
          if (target && "value" in target) {
            const { value } = target;
            if (typeof value === "string") {
              setText(value);
            }
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({
            files: [],
            text,
          });
        }}
      >
        {children}
      </form>
    );
  },
  PromptInputButton: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  PromptInputFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PromptInputSubmit: () => <button type="submit">Submit</button>,
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
  // ProviderModelPicker（NewTaskView 模块级 import）需要这个 value 导出，
  // 否则模块加载阶段就 SyntaxError。这里只渲染 TestModelPicker，不会真正调用。
  setDefaultProviderSelection: mock(async () => {}),
}));

mock.module("@/features/composer/SlashEditor", () => ({
  SlashEditor: ({ placeholder }: { placeholder?: string }) => (
    <textarea aria-label={placeholder ?? "message"} name="message" />
  ),
}));

mock.module("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
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

function TestModelPicker({
  onChange,
}: {
  onChange: (selection: { providerId: string; modelId: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onChange({
          providerId: "conn-sf",
          modelId: "deepseek-ai/DeepSeek-V3.2",
        })
      }
    >
      Model
    </button>
  );
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
  createConversationRequests.length = 0;
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
    expect(heading.className).toContain("font-serif");
    expect(container.querySelector(".typewriter-caret")).toBeNull();
  });

  it("renders the supporting copy and the safety guide link", () => {
    renderNewTaskView();

    const subtitle = screen.getByText(
      "Choose a project folder, describe the goal, and I will use local tools to move the work forward in your workspace.",
    );
    const safetyGuide = screen.getByRole("button", {
      name: "Read the local safety guide",
    });

    expect(subtitle).toBeDefined();
    expect(safetyGuide).toBeDefined();
  });

  it("renders the safety docs link alongside the supporting copy, above the prompt input", () => {
    renderNewTaskView();

    const promptInput = screen
      .getByLabelText("How can I help you today?")
      .closest("form");
    const docsText = screen.getByText("Read the local safety guide");
    const docsControl = docsText.closest("a,button");

    expect(promptInput).not.toBeNull();
    expect(docsControl).not.toBeNull();
    // 帮助指南已挪到副标题行，位于输入框之前（PRECEDING）。
    expect(
      Boolean(
        promptInput!.compareDocumentPosition(docsControl!) &
          document.defaultView!.Node.DOCUMENT_POSITION_PRECEDING,
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

  it("stores the selected model on the created conversation", async () => {
    renderNewTaskView();

    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    fireEvent.change(screen.getByLabelText("How can I help you today?"), {
      target: { value: "Build the thing" },
    });
    fireEvent.submit(
      screen.getByLabelText("How can I help you today?").closest("form")!,
    );

    await screen.findByRole("heading", {
      name: "Let Agent Studio move work forward on this desktop.",
    });
    await waitFor(() => {
      expect(createConversationRequests).toHaveLength(1);
      expect(JSON.parse(String(createConversationRequests[0]?.body))).toEqual({
        title: "New task",
        workingDir: null,
        model: "deepseek-ai/DeepSeek-V3.2",
      });
    });
  });
});
