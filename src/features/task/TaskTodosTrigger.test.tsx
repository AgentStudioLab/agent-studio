import { afterEach, describe, expect, it } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { TaskTodosTrigger } from "./TaskTodosTrigger";
import type { AgentTask } from "@/lib/agui/runtime/types";

globalThis.CustomEvent = window.CustomEvent;
globalThis.Element = window.Element;
globalThis.Event = window.Event;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLInputElement = window.HTMLInputElement;
globalThis.Node = window.Node;
globalThis.NodeFilter = window.NodeFilter;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);

function makeI18n() {
  const i18n = i18next.createInstance();
  void i18n.init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          task: {
            todos: {
              trigger: "Tasks {{completed}}/{{total}}",
              step: "Step {{current}} / {{total}}",
              title: "Tasks",
              empty: "No active tasks",
              activePrefix: "Now",
              status: {
                pending: "Pending",
                in_progress: "In progress",
                completed: "Completed",
              },
            },
          },
        },
      },
    },
  });
  return i18n;
}

function renderTrigger(tasks: AgentTask[]) {
  return render(
    <I18nextProvider i18n={makeI18n()}>
      <TaskTodosTrigger tasks={tasks} />
    </I18nextProvider>,
  );
}

describe("TaskTodosTrigger", () => {
  afterEach(() => cleanup());

  it("renders nothing without tasks", () => {
    const { container } = renderTrigger([]);

    expect(container.textContent).toBe("");
  });

  it("shows completed count and active task", () => {
    renderTrigger([
      {
        id: "a",
        subject: "A",
        description: "",
        status: "completed",
        updatedAt: 1,
      },
      {
        id: "b",
        subject: "B",
        description: "",
        activeForm: "Working on B",
        status: "in_progress",
        updatedAt: 2,
      },
      {
        id: "c",
        subject: "C",
        description: "",
        status: "pending",
        updatedAt: 3,
      },
    ]);

    const trigger = screen.getByRole("button", { name: /step 2 \/ 3/i });
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("Step 2 / 3");
    expect(trigger.className).not.toContain("w-full");
  });

  it("opens a readonly hover list", async () => {
    renderTrigger([
      {
        id: "a",
        subject: "A",
        description: "Done desc",
        status: "completed",
        updatedAt: 1,
      },
      {
        id: "b",
        subject: "B",
        description: "Todo desc",
        status: "pending",
        updatedAt: 2,
      },
    ]);

    fireEvent.pointerEnter(screen.getByRole("button", { name: /step 1 \/ 2/i }));

    await waitFor(() => expect(screen.getByText("A")).toBeTruthy());
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete|clear|edit/i })).toBeNull();
  });
});
