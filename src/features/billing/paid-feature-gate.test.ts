import { describe, expect, it, mock } from "bun:test";
import type { DesktopAuthSession } from "@/features/auth/auth-types";

const consumeDesktopCredits = mock(async () => ({ remainingCredits: 9 }));

mock.module("@/features/auth/desktop-auth-client", () => ({
  consumeDesktopCredits,
}));

const session = {
  tokens: {
    accessToken: "access-token",
    accessTokenExpiresAt: Date.now() + 3_600_000,
    refreshToken: "refresh-token",
    refreshTokenExpiresAt: Date.now() + 7_200_000,
  },
  user: {
    id: "user-1",
    credits: { remainingCredits: 10 },
  },
} satisfies DesktopAuthSession;

describe("ensurePaidFeatureAccess", () => {
  it("authenticates before consuming credits", async () => {
    const { ensurePaidFeatureAccess } = await import("./paid-feature-gate");
    const calls: string[] = [];
    consumeDesktopCredits.mockImplementationOnce(async () => {
      calls.push("consume");
      return { remainingCredits: 9 };
    });

    const result = await ensurePaidFeatureAccess({
      auth: {
        ensureAuthenticated: async () => {
          calls.push("auth");
          return session;
        },
        getValidAccessToken: async () => {
          calls.push("token");
          return "access-token";
        },
        refreshUser: async () => {
          calls.push("refresh");
        },
      },
      amount: 1,
      scene: "desktop_paid_feature",
      description: "Use paid desktop feature",
      idempotencyKey: "operation-1",
      metadata: { feature: "test" },
    });

    expect(calls).toEqual(["auth", "token", "consume", "refresh"]);
    expect(consumeDesktopCredits).toHaveBeenCalledWith({
      accessToken: "access-token",
      amount: 1,
      scene: "desktop_paid_feature",
      description: "Use paid desktop feature",
      idempotencyKey: "operation-1",
      metadata: { feature: "test" },
    });
    expect(result).toEqual({ remainingCredits: 9 });
  });

  it("does not consume credits when authentication fails", async () => {
    const { ensurePaidFeatureAccess } = await import("./paid-feature-gate");
    consumeDesktopCredits.mockClear();

    await expect(
      ensurePaidFeatureAccess({
        auth: {
          ensureAuthenticated: async () => {
            throw new Error("auth_required");
          },
          getValidAccessToken: async () => "access-token",
          refreshUser: async () => {},
        },
        amount: 1,
        scene: "desktop_paid_feature",
        idempotencyKey: "operation-1",
      }),
    ).rejects.toThrow("auth_required");

    expect(consumeDesktopCredits).not.toHaveBeenCalled();
  });
});
