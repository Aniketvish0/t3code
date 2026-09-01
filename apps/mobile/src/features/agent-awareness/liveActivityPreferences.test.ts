import { beforeEach, vi } from "vite-plus/test";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { EnvironmentId } from "@t3tools/contracts";
import { RelayEnvironmentLinkRevokedError } from "@t3tools/contracts/relay";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import * as Layer from "effect/Layer";
import { HttpClient } from "effect/unstable/http";

import type { SavedRemoteConnection } from "../../lib/connection";
import { MobileStorage } from "../../persistence/mobile-storage";
import {
  CloudEnvironmentLinkError,
  linkEnvironmentToCloudWithPreference,
} from "../cloud/linkEnvironment";
import { setLiveActivityUpdatesEnabled } from "./liveActivityPreferences";
import { updateAgentAwarenessRegistrationPreferences } from "./remoteRegistration";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        relay: {
          url: "https://relay.example.test",
        },
      },
    },
  },
}));

vi.mock("expo-device", () => ({
  deviceType: 1,
  DeviceType: {
    UNKNOWN: 0,
    PHONE: 1,
    TABLET: 2,
    DESKTOP: 3,
    TV: 4,
  },
  osVersion: "18.4.1",
  modelName: "iPhone 15 Pro",
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("../cloud/linkEnvironment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloud/linkEnvironment")>();
  return {
    ...actual,
    linkEnvironmentToCloudWithPreference: vi.fn(() => Effect.void),
  };
});

vi.mock("./remoteRegistration", () => ({
  updateAgentAwarenessRegistrationPreferences: vi.fn(() => Effect.void),
}));

const connection: SavedRemoteConnection = {
  environmentId: "env-1" as EnvironmentId,
  environmentLabel: "Desktop",
  pairingUrl: "https://desktop.example.test/",
  displayUrl: "https://desktop.example.test/",
  httpBaseUrl: "https://desktop.example.test/",
  wsBaseUrl: "wss://desktop.example.test/ws",
  bearerToken: "local-bearer",
};

const secondConnection: SavedRemoteConnection = {
  ...connection,
  environmentId: "env-2" as EnvironmentId,
  environmentLabel: "Laptop",
  pairingUrl: "https://laptop.example.test/",
  displayUrl: "https://laptop.example.test/",
  httpBaseUrl: "https://laptop.example.test/",
  wsBaseUrl: "wss://laptop.example.test/ws",
};

const testLayer = Layer.mergeAll(
  Layer.succeed(ManagedRelay.ManagedRelayClient, null as never),
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() => Effect.die("unexpected HTTP request")),
  ),
  Layer.succeed(
    MobileStorage,
    MobileStorage.of({
      loadSavedConnections: Effect.succeed([]),
      saveConnection: () => Effect.void,
      clearSavedConnection: () => Effect.void,
      loadOrCreateAgentAwarenessDeviceId: Effect.succeed("device-1"),
      loadAgentAwarenessDeviceId: Effect.succeed("device-1"),
      loadAgentAwarenessRegistrationRecord: Effect.succeed(null),
      saveAgentAwarenessRegistrationRecord: () => Effect.void,
      clearAgentAwarenessRegistrationRecord: Effect.void,
      loadRecentThreadShortcuts: Effect.succeed([]),
      saveRecentThreadShortcuts: () => Effect.void,
    }),
  ),
);

describe("liveActivityPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(linkEnvironmentToCloudWithPreference).mockImplementation(() => Effect.void);
    vi.mocked(updateAgentAwarenessRegistrationPreferences).mockImplementation(() => Effect.void);
  });

  it.effect("keeps local preferences refreshable when signed out", () =>
    Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({
        enabled: false,
        previousEnabled: true,
        clerkToken: null,
        connections: [connection],
      });

      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenCalledWith({
        liveActivitiesEnabled: false,
      });
      expect(linkEnvironmentToCloudWithPreference).not.toHaveBeenCalled();
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("does not try to re-link managed relay connections without bearer credentials", () => {
    const managedConnection: SavedRemoteConnection = {
      ...connection,
      bearerToken: null,
    };

    return Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({
        enabled: true,
        previousEnabled: false,
        clerkToken: "clerk-token",
        connections: [connection, managedConnection],
      });

      expect(linkEnvironmentToCloudWithPreference).toHaveBeenCalledTimes(1);
      expect(linkEnvironmentToCloudWithPreference).toHaveBeenCalledWith({
        clerkToken: "clerk-token",
        connection,
        intent: "resume",
        liveActivitiesEnabled: true,
      });
    }).pipe(Effect.provide(testLayer));
  });

  it.effect("keeps the preference update when one environment link was revoked", () => {
    const revokedRelayError = new RelayEnvironmentLinkRevokedError({
      code: "environment_link_revoked",
      traceId: "trace-revoked",
    });
    const revokedLinkError = new CloudEnvironmentLinkError({
      message: "The environment link was revoked.",
      cause: new ManagedRelay.ManagedRelayRequestFailedError({
        action: "link relay environment",
        cause: revokedRelayError,
        relayError: revokedRelayError,
        traceId: revokedRelayError.traceId,
      }),
    });
    vi.mocked(linkEnvironmentToCloudWithPreference).mockImplementation((input) =>
      input.connection.environmentId === connection.environmentId
        ? Effect.fail(revokedLinkError)
        : Effect.void,
    );

    return Effect.gen(function* () {
      yield* setLiveActivityUpdatesEnabled({
        enabled: false,
        previousEnabled: true,
        clerkToken: "clerk-token",
        connections: [connection, secondConnection],
      });

      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenCalledTimes(1);
      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenCalledWith({
        liveActivitiesEnabled: false,
      });
      expect(linkEnvironmentToCloudWithPreference).toHaveBeenCalledTimes(2);
      expect(linkEnvironmentToCloudWithPreference).toHaveBeenCalledWith({
        clerkToken: "clerk-token",
        connection: secondConnection,
        intent: "resume",
        liveActivitiesEnabled: false,
      });
    }).pipe(Effect.provide(testLayer));
  });

  it.effect("restores relay preferences when an environment update fails", () => {
    vi.mocked(linkEnvironmentToCloudWithPreference).mockImplementationOnce(() =>
      Effect.fail(new CloudEnvironmentLinkError({ message: "environment update failed" })),
    );

    return Effect.gen(function* () {
      const exit = yield* Effect.exit(
        setLiveActivityUpdatesEnabled({
          enabled: false,
          previousEnabled: true,
          clerkToken: "clerk-token",
          connections: [connection],
        }),
      );

      expect(exit._tag).toBe("Failure");
      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenNthCalledWith(1, {
        liveActivitiesEnabled: false,
      });
      expect(updateAgentAwarenessRegistrationPreferences).toHaveBeenNthCalledWith(2, {
        liveActivitiesEnabled: true,
      });
      expect(linkEnvironmentToCloudWithPreference).toHaveBeenNthCalledWith(1, {
        clerkToken: "clerk-token",
        connection,
        intent: "resume",
        liveActivitiesEnabled: false,
      });
      expect(linkEnvironmentToCloudWithPreference).toHaveBeenNthCalledWith(2, {
        clerkToken: "clerk-token",
        connection,
        intent: "resume",
        liveActivitiesEnabled: true,
      });
    }).pipe(Effect.provide(testLayer));
  });
});
