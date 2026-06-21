import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import i18n from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import type { ChatRuntime, ChatState } from "@/lib/agui/runtime";

mock.module("streamdown", () => ({
  Streamdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

mock.module("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  ConversationScrollButton: () => null,
}));

const originalOpen = window.open;
const originalOrigin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN;
const testI18n = i18n.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "en",
  resources: {
    en: {
      translation: {
        task: {
          error: {
            insufficientCredits:
              "Not enough credits. Please top up on the website.",
            topUpCredits: "Top up on the website",
          },
        },
      },
    },
  },
});

function makeRuntime(state: ChatState): ChatRuntime {
  return {
    getState: () => state,
    subscribe: () => () => {},
    send: async () => {},
    regenerate: async () => {},
    cancel: async () => {},
    resume: async () => {},
    attachToRun: () => {},
    restoreAwaiting: () => {},
    setHistoricalMessages: () => {},
    reset: () => {},
    destroy: () => {},
  };
}

function renderChatStream(state: ChatState) {
  const { ChatStream } = require("./ChatStream") as typeof import("./ChatStream");
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter>
        <ChatStream
          threadId="thread-1"
          runtime={makeRuntime(state)}
          messages={[]}
          isThinking={false}
          isRunning={false}
          error={state.error}
          pendingInterrupts={state.pendingInterrupts}
          onResume={async () => {}}
          onAllowAlways={() => {}}
          onContinueAfterRestart={() => {}}
          workingDir={null}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

function baseState(overrides: Partial<ChatState> = {}): ChatState {
  return {
    historicalMessages: [],
    liveMessages: [],
    isRunning: false,
    isThinking: false,
    activeRunId: null,
    pendingInterrupts: [],
    error: null,
    lastCursor: null,
    runStartedAt: null,
    ...overrides,
  };
}

describe("ChatStream", () => {
  afterEach(() => {
    cleanup();
    window.open = originalOpen;
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
  });

  it("renders a top-up prompt for official provider insufficient credits", () => {
    import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "https://example.test";
    const openMock = mock(() => null);
    window.open = openMock as typeof window.open;

    renderChatStream(baseState({
      error: "insufficient credits",
      errorCode: "INSUFFICIENT_CREDITS" as never,
    }));

    expect(
      screen.getByText("Not enough credits. Please top up on the website."),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Top up on the website" }));

    expect(openMock).toHaveBeenCalledWith(
      "https://example.test/pricing",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("normalizes malformed ask-user questions payload before rendering", () => {
    renderChatStream(baseState({
      pendingInterrupts: [
        {
          id: "ask_1",
          reason: "ask_user",
          payload: {
            toolName: "AskUserQuestion",
            questions: {
              0: {
                question: "malformed should not render",
                header: "Bad payload",
                multiSelect: false,
                options: [{ label: "Bad option", description: "" }],
              },
              length: 1,
            },
          },
        },
      ],
    }));

    expect(screen.queryByText("malformed should not render")).toBeNull();
  });
});
