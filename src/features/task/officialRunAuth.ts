import type { AuthContextValue } from "@/features/auth/AuthContext";
import { getWebsiteOrigin } from "@/features/auth/desktop-auth-client";
import type { ProviderModelSelection } from "@/lib/data/settings";

export const OFFICIAL_PROVIDER_ID = "official";

export interface OfficialRunAuthFields {
  officialAuthToken?: string;
  officialWebsiteOrigin?: string;
}

export async function buildOfficialRunAuthFields(input: {
  auth: Pick<AuthContextValue, "ensureAuthenticated" | "getValidAccessToken">;
  providerSelection: ProviderModelSelection | null;
  defaultSelection: ProviderModelSelection | null;
}): Promise<OfficialRunAuthFields> {
  const effectiveSelection = input.providerSelection ?? input.defaultSelection;
  if (effectiveSelection?.providerId !== OFFICIAL_PROVIDER_ID) {
    return {};
  }

  // ensureAuthenticated 负责在未登录时拉起官网授权；随后再取一次有效 token，
  // 覆盖 access token 临近过期需要 refresh 的情况。
  await input.auth.ensureAuthenticated();
  const officialAuthToken = await input.auth.getValidAccessToken();
  return {
    officialAuthToken,
    officialWebsiteOrigin: getWebsiteOrigin(),
  };
}
