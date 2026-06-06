import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ReactNode } from "react";

const getProfile = mock(async () => ({
  callMe: "Local Nickname",
  work: "engineer",
  instructions: "Keep answers concise.",
}));
const setProfile = mock(async (patch: Record<string, unknown>) => ({
  callMe: "Local Nickname",
  work: "engineer",
  instructions: "Keep answers concise.",
  ...patch,
}));
const open = mock(async (_url: string) => {});
const getProvider = mock(async () => ({
  version: 3,
  current: {},
  activePresetId: "",
  presets: [],
  defaultSelection: null,
  connections: [],
  enabledModels: [],
  builtIn: [],
}));
const providerMutation = mock(async () => ({
  version: 3,
  current: {},
  activePresetId: "",
  presets: [],
  defaultSelection: null,
  connections: [],
  enabledModels: [],
  builtIn: [],
  connection: {},
}));

const authState = {
  status: "signed-in",
  user: {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.test",
    image: "https://cdn.example.test/avatar.png",
    credits: { remainingCredits: 42 },
  },
  tokens: null,
  loginRequest: null,
  loginError: null,
  login: mock(async () => {}),
  cancelLogin: mock(() => {}),
  reopenLogin: mock(async () => {}),
  logout: mock(async () => {}),
  ensureAuthenticated: mock(async () => {
    throw new Error("auth_required");
  }),
  refreshUser: mock(async () => {
    throw new Error("auth_required");
  }),
  getValidAccessToken: mock(async () => {
    throw new Error("auth_required");
  }),
};

mock.module("@/lib/data/settings", () => ({
  getProvider,
  getProfile,
  setProfile,
  getProviderConnection: mock(async () => ({})),
  createProviderConnection: providerMutation,
  updateProviderConnection: providerMutation,
  deleteProviderConnection: mock(async () => ({
    version: 3,
    current: {},
    activePresetId: "",
    presets: [],
    defaultSelection: null,
    connections: [],
    enabledModels: [],
    builtIn: [],
  })),
  refreshProviderConnectionModels: providerMutation,
  setProviderConnectionEnabledModels: providerMutation,
}));

mock.module("@tauri-apps/plugin-shell", () => ({ open }));

mock.module("react-i18next", () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "settings.profile.account": "Account",
        "settings.profile.editOnWebsite": "Edit on website",
        "settings.profile.work": "What best describes your work?",
        "settings.profile.workOptions.engineer": "Software engineer",
        "settings.profile.workOptions.designer": "Designer",
        "settings.profile.workOptions.pm": "Product manager",
        "settings.profile.workOptions.researcher": "Researcher",
        "settings.profile.workOptions.writer": "Writer",
        "settings.profile.workOptions.operations": "Operations / Business",
        "settings.profile.workOptions.other": "Other",
        "settings.profile.instructions": "Instructions for Agent Studio",
        "settings.profile.instructionsHint": "Agent Studio will remember these preferences.",
        "settings.profile.instructionsLearnMore": "Learn more",
        "settings.profile.instructionsPlaceholder": "e.g. ask clarifying questions",
        "sidebar.user.signedIn": "Signed in",
        "sidebar.user.signedOut": "Not signed in",
      };
      return translations[key] ?? key;
    },
  }),
}));

mock.module("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    children: ReactNode;
  }) => (
    <select
      aria-label="profile-work"
      value={value}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const { AuthContext } = require("@/features/auth/AuthContext") as typeof import("@/features/auth/AuthContext");
const { ProfileForm } = require("./ProfileForm") as typeof import("./ProfileForm");

const originalOrigin = import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN;

function renderProfileForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <AuthContext.Provider value={authState}>
      <QueryClientProvider client={queryClient}>
        <ProfileForm />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = "http://www.agentstudio.chat:3000";
  getProvider.mockClear();
  providerMutation.mockClear();
  getProfile.mockClear();
  setProfile.mockClear();
  open.mockClear();
});

afterEach(() => {
  cleanup();
  import.meta.env.VITE_AGENT_STUDIO_WEBSITE_ORIGIN = originalOrigin;
});

describe("ProfileForm", () => {
  it("shows the signed-in avatar and nickname as read-only website profile data", async () => {
    const { container } = renderProfileForm();

    await waitFor(() => expect(screen.getByText("Ada Lovelace")).toBeDefined());

    expect(screen.queryByDisplayValue("Local Nickname")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.test/avatar.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit on website" }));

    expect(open).toHaveBeenCalledWith(
      "http://www.agentstudio.chat:3000/settings/profile",
    );
  });

  it("keeps work type and preference instructions editable locally", async () => {
    const { container } = renderProfileForm();

    await waitFor(() => expect(container.querySelector("select")).not.toBeNull());

    const workSelect = container.querySelector("select");
    expect(workSelect).not.toBeNull();
    fireEvent.change(workSelect!, { target: { value: "designer" } });

    await waitFor(() => expect(setProfile).toHaveBeenCalledWith({ work: "designer" }));

    const instructions = screen.getByPlaceholderText("e.g. ask clarifying questions");
    fireEvent.change(instructions, { target: { value: "Prefer short answers." } });
    fireEvent.blur(instructions);

    await waitFor(() =>
      expect(setProfile).toHaveBeenCalledWith({
        instructions: "Prefer short answers.",
      }),
    );
  });
});
