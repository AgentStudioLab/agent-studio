import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppShellProvider, useAppShell } from "./AppShellContext";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

function SearchProbe() {
  const { searchOpen } = useAppShell();
  return <div data-testid="search-open">{String(searchOpen)}</div>;
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

  it("toggles the global search dialog with Cmd+K", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppShellProvider>
          <SearchProbe />
        </AppShellProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("search-open").textContent).toBe("false");

    act(() => {
      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true });
    });
    expect(screen.getByTestId("search-open").textContent).toBe("true");

    // Pressing again closes it (toggle).
    act(() => {
      fireEvent.keyDown(document, { key: "k", code: "KeyK", metaKey: true });
    });
    expect(screen.getByTestId("search-open").textContent).toBe("false");
  });
});
