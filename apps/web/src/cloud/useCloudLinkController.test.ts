import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";

import { resolveAccountEnvironmentMembership } from "./useCloudLinkController";

const environmentId = EnvironmentId.make("env-1");
const baseInput = {
  account: {
    accountId: "user_123",
    data: [{ environmentId, cleanupPending: false }],
    error: null,
    isPending: false,
  },
  cloudUserId: "user_123",
  configuredRelayUrl: "https://relay.example.test",
  environmentId,
  linkedRelayUrl: "https://relay.example.test",
} as const;

describe("resolveAccountEnvironmentMembership", () => {
  it.each([
    ["a refresh is pending", { error: null, isPending: true }],
    ["a refresh has failed", { error: "refresh failed", isPending: false }],
  ])("uses cached account data while %s", (_scenario, refreshState) => {
    expect(
      resolveAccountEnvironmentMembership({
        ...baseInput,
        account: {
          ...baseInput.account,
          data: [],
          ...refreshState,
        },
      }),
    ).toBe(false);
  });

  it("falls back to local state before account data has loaded", () => {
    expect(
      resolveAccountEnvironmentMembership({
        ...baseInput,
        account: { ...baseInput.account, data: null, isPending: true },
      }),
    ).toBeNull();
  });
});
