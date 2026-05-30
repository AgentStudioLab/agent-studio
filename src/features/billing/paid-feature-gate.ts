import type { DesktopAuthSession } from "@/features/auth/auth-types";
import { consumeDesktopCredits } from "@/features/auth/desktop-auth-client";

export interface PaidFeatureAuth {
  ensureAuthenticated: () => Promise<DesktopAuthSession>;
  getValidAccessToken: () => Promise<string>;
  refreshUser: () => Promise<void>;
}

export async function ensurePaidFeatureAccess(input: {
  auth: PaidFeatureAuth;
  amount: number;
  scene: string;
  description?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ remainingCredits: number }> {
  await input.auth.ensureAuthenticated();
  const accessToken = await input.auth.getValidAccessToken();
  const result = await consumeDesktopCredits({
    accessToken,
    amount: input.amount,
    scene: input.scene,
    description: input.description,
    idempotencyKey: input.idempotencyKey,
    metadata: input.metadata,
  });
  await input.auth.refreshUser();
  return result;
}
