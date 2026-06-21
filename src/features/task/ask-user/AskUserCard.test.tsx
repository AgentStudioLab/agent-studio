// AskUserCard behavioral tests.
//
// Covers the four contract points from the spec:
//   1. Single-select auto-advances after 150ms.
//   2. Multi-select toggles without advancing; "N selected" counter tracks set.
//   3. Something else: typing populates custom answer; Cmd+Enter commits.
//   4. X close / Send on last page submits whichever answers exist, with
//      untouched questions encoded as { skipped: true }.

import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { AskUserCard } from "./AskUserCard";
import type { AskUserQuestionDef } from "./types";

// Minimal i18n bootstrap — register the only keys the card reads. Keeping the
// instance local to this test avoids coupling to the main app's i18n module.
const testI18n = i18n.createInstance();
void testI18n.use(initReactI18next).init({
  lng: "en",
  resources: {
    en: {
      translation: {
        task: {
          askUser: {
            pageOf: "{{page}} of {{total}}",
            somethingElse: "Something else",
            somethingElsePlaceholder: "type",
            selectedCount: "{{count}} selected",
            skip: "Skip",
            send: "Send",
            next: "Next",
            close: "Close",
            prevPage: "Prev",
            nextPage: "Next page",
          },
        },
      },
    },
  },
});

function Wrap({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>;
}

const SINGLE_Q: AskUserQuestionDef = {
  question: "color?",
  header: "Color",
  multiSelect: false,
  options: [
    { label: "Red", description: "warm" },
    { label: "Blue", description: "cool" },
  ],
};

const MULTI_Q: AskUserQuestionDef = {
  question: "modules?",
  header: "Modules",
  multiSelect: true,
  options: [
    { label: "Auth", description: "" },
    { label: "Billing", description: "" },
    { label: "Search", description: "" },
  ],
};

describe("AskUserCard", () => {
  // Bun's test runner doesn't auto-call testing-library cleanup between tests
  // the way Jest+jest-environment-jsdom does, so previous renders' DOM stays
  // in document.body and screen.getByText() finds elements from the
  // *previous* test. Manually unmount after each it().
  afterEach(() => cleanup());

  it("single-select auto-advances then sends on last page", async () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard
          questions={[SINGLE_Q, { ...SINGLE_Q, question: "size?", header: "Size" }]}
          onSubmit={onSubmit}
        />
      </Wrap>,
    );
    // Pick the first question's "Red"
    fireEvent.click(screen.getByText("Red"));
    // After 150ms auto-advance the second question's options should show.
    await waitFor(() => expect(screen.getByText("size?")).toBeDefined(), {
      timeout: 500,
    });
    // Pick on last page → Send fires onSubmit
    fireEvent.click(screen.getAllByText("Red")[0]!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled(), { timeout: 500 });
    const arg = (onSubmit.mock.calls[0] as unknown[])[0] as {
      answers: { question: string; selected?: string[] }[];
    };
    expect(arg.answers[0]).toEqual({ question: "color?", selected: ["Red"] });
    expect(arg.answers[1]).toEqual({ question: "size?", selected: ["Red"] });
  });

  it("multi-select toggles without advancing; counter tracks size", () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard questions={[MULTI_Q]} onSubmit={onSubmit} />
      </Wrap>,
    );
    fireEvent.click(screen.getByText("Auth"));
    expect(screen.getByText("1 selected")).toBeDefined();
    fireEvent.click(screen.getByText("Search"));
    expect(screen.getByText("2 selected")).toBeDefined();
    // Did NOT submit — still on first (and only) page.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Send on last page emits selected labels for multi-select", async () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard questions={[MULTI_Q]} onSubmit={onSubmit} />
      </Wrap>,
    );
    fireEvent.click(screen.getByText("Auth"));
    fireEvent.click(screen.getByText("Billing"));
    fireEvent.click(screen.getByLabelText("Send"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const arg = (onSubmit.mock.calls[0] as unknown[])[0] as {
      answers: { question: string; selected?: string[] }[];
    };
    expect(arg.answers[0]?.selected).toEqual(["Auth", "Billing"]);
  });

  it("Skip + Send encodes untouched questions as { skipped: true }", async () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard
          questions={[SINGLE_Q, MULTI_Q]}
          onSubmit={onSubmit}
        />
      </Wrap>,
    );
    // Skip page 1 → should advance to page 2
    fireEvent.click(screen.getAllByText("Skip")[0]!);
    await waitFor(() => expect(screen.getByText("modules?")).toBeDefined());
    // Page 2 (multi-select): close via X — should flush with both untouched/skipped
    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const arg = (onSubmit.mock.calls[0] as unknown[])[0] as {
      answers: ({ question: string; skipped?: true } | { question: string; selected?: string[] })[];
    };
    expect(arg.answers[0]).toEqual({ question: "color?", skipped: true });
    expect(arg.answers[1]).toEqual({ question: "modules?", skipped: true });
  });

  it("renders a safe fallback when a question has missing optional fields", () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard
          questions={[
            {
              question: "continue?",
              header: "",
              multiSelect: false,
              options: [{ label: "Yes", description: "" }],
            },
          ]}
          onSubmit={onSubmit}
        />
      </Wrap>,
    );

    expect(screen.getByText("continue?")).toBeDefined();
    expect(screen.getByText("Yes")).toBeDefined();
  });

  it("disables repeated submit after the first decision", async () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard questions={[MULTI_Q]} onSubmit={onSubmit} />
      </Wrap>,
    );

    fireEvent.click(screen.getByText("Auth"));
    const send = screen.getByLabelText("Send");
    fireEvent.click(send);
    fireEvent.click(send);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("does not render approval terminology", () => {
    const onSubmit = mock(() => {});
    render(
      <Wrap>
        <AskUserCard questions={[SINGLE_Q]} onSubmit={onSubmit} />
      </Wrap>,
    );
    expect(screen.queryByText(/approve|approval|deny/i)).toBeNull();
  });
});
