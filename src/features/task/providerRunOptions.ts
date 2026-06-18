import type { AuthContextValue } from "@/features/auth/AuthContext";
import type { ProviderModelSelection } from "@/lib/data/settings";
import { buildOfficialRunAuthFields } from "./officialRunAuth";

export interface TaskRunOptions {
  permissionMode?: "ask" | "act-without-asking";
  providerSelection?: ProviderModelSelection;
  model?: string;
  approvalRules?: string[];
  officialAuthToken?: string;
  officialWebsiteOrigin?: string;
}

interface BuildProviderRunOptionsInput {
  auth: Pick<AuthContextValue, "ensureAuthenticated" | "getValidAccessToken">;
  providerSelection?: ProviderModelSelection | null;
  resolveDefaultProviderSelection: () => Promise<ProviderModelSelection | null>;
  permissionMode?: "ask" | "act-without-asking";
  model?: string | null;
  approvalRules?: string[];
  onOfficialRunPending?: () => void;
}

export async function buildProviderRunOptions({
  auth,
  providerSelection,
  resolveDefaultProviderSelection,
  permissionMode,
  model,
  approvalRules,
  onOfficialRunPending,
}: BuildProviderRunOptionsInput): Promise<TaskRunOptions> {
  const explicitSelection = providerSelection ?? null;
  const defaultSelection = explicitSelection
    ? null
    : await resolveDefaultProviderSelection();
  const effectiveSelection = explicitSelection ?? defaultSelection;
  const officialFields = await buildOfficialRunAuthFields({
    auth,
    providerSelection: explicitSelection,
    defaultSelection,
  });

  if (officialFields.officialAuthToken) {
    onOfficialRunPending?.();
  }

  return {
    ...(permissionMode ? { permissionMode } : {}),
    ...(effectiveSelection ? { providerSelection: effectiveSelection } : {}),
    ...(model ? { model } : {}),
    ...(approvalRules?.length ? { approvalRules } : {}),
    ...officialFields,
  };
}
