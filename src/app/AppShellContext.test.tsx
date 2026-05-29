import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppShellProvider } from "./AppShellContext";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function renderShell(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppShellProvider>
        <LocationProbe />
      </AppShellProvider>
    </MemoryRouter>,
  );
}

describe("AppShellProvider shortcuts", () => {
  afterEach(() => cleanup());

  it("opens Settings with Cmd+Comma", () => {
    renderShell("/");

    act(() => {
      fireEvent.keyDown(document, { key: ",", code: "Comma", metaKey: true });
    });

    expect(screen.getByTestId("pathname").textContent).toBe("/settings");
  });
});
