import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.back": "Back",
        "settings.title": "Settings",
        "settings.nav.account": "Account",
        "settings.nav.model": "Model",
        "settings.nav.permissions": "Permissions",
        "settings.nav.appearance": "Appearance",
        "settings.nav.remoteConnections": "Remote Connections",
      };
      return translations[key] ?? key;
    },
  }),
}));

const { SettingsLayout } = require("./SettingsLayout") as typeof import("./SettingsLayout");

function renderSettingsLayout(path = "/settings/account") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings" element={<SettingsLayout />}>
          <Route path="account" element={<div>Account panel</div>} />
          <Route path="model" element={<div>Model panel</div>} />
          <Route path="permissions" element={<div>Permissions panel</div>} />
          <Route path="appearance" element={<div>Appearance panel</div>} />
          <Route path="remote-connections" element={<div>Remote Connections panel</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("SettingsLayout", () => {
  it("shows a semantic icon before each settings navigation option", () => {
    renderSettingsLayout();

    expect(screen.getByRole("link", { name: "Account" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Model" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Permissions" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Appearance" }).querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Remote Connections" }).querySelector("svg")).not.toBeNull();
  });
});
