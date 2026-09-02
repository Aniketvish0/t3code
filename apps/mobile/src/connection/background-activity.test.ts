import {
  AVAILABLE_CONNECTION_STATE,
  type ConnectionCatalogEntry,
  EnvironmentRegistry,
  EnvironmentSupervisor,
  type NetworkStatus,
  type PreparedConnection,
  RelayConnectionTarget,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import type { RpcSession, WsRpcProtocolClient } from "@t3tools/client-runtime/rpc";
import { type ClientActivityReportInput, EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";
import { vi } from "vite-plus/test";

import { MobileStorage } from "../persistence/mobile-storage";
import { mobileBackgroundActivityReporterLayer } from "./background-activity";
import {
  onRetainedMobileBackgroundScopesChange,
  observeMobileBackgroundActivitySubscription,
  retainedMobileBackgroundScopes,
} from "./background-activity-scopes";

vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => {} }) },
}));
vi.mock("expo-secure-store", () => ({}));

describe("mobile background activity", () => {
  it.effect("reports activity after reconnect when the initial report had no session", () =>
    Effect.gen(function* () {
      const environmentId = EnvironmentId.make("reconnecting-environment");
      const target = new RelayConnectionTarget({ environmentId, label: "Test environment" });
      const reports = yield* Queue.unbounded<ClientActivityReportInput>();
      const attempts = yield* Queue.unbounded<void>();
      const debounceArmed = yield* Queue.sliding<void>(1);
      const clock = yield* Clock.Clock;
      const reporterClock = {
        ...clock,
        sleep: Effect.fn("TestMobileActivity.sleep")(function* (duration: Duration.Duration) {
          if (Duration.toMillis(duration) !== 250) return yield* clock.sleep(duration);
          const timer = yield* clock
            .sleep(duration)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Queue.offer(debounceArmed, undefined);
          yield* Fiber.join(timer);
        }),
      };
      const state = yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        desired: true,
        network: "online",
        phase: "connecting",
      });
      const session = yield* SubscriptionRef.make<Option.Option<RpcSession>>(Option.none());
      const supervisor = EnvironmentSupervisor.of({
        target,
        state,
        session,
        prepared: yield* SubscriptionRef.make<Option.Option<PreparedConnection>>(Option.none()),
        connect: Effect.void,
        disconnect: Effect.void,
        retryNow: Effect.void,
      });
      const registryLayer = Layer.mock(EnvironmentRegistry, {
        entries: yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(
          new Map([[environmentId, { target, profile: Option.none() }]]),
        ),
        networkStatus: yield* SubscriptionRef.make<NetworkStatus>("online"),
        run: (_environmentId, effect) =>
          Effect.provideService(effect, EnvironmentSupervisor, supervisor).pipe(
            Effect.ensuring(Queue.offer(attempts, undefined)),
          ),
        followStream: (_environmentId, stream) =>
          Stream.provideService(stream, EnvironmentSupervisor, supervisor),
      });
      yield* Layer.build(
        mobileBackgroundActivityReporterLayer.pipe(
          Layer.provide(registryLayer),
          Layer.provide(
            Layer.mock(MobileStorage, {
              loadOrCreateAgentAwarenessDeviceId: Effect.succeed("test-device"),
            }),
          ),
        ),
      ).pipe(Effect.provideService(Clock.Clock, reporterClock));

      yield* Queue.take(debounceArmed);
      yield* TestClock.adjust("250 millis");
      yield* Queue.take(attempts);
      yield* Queue.clear(debounceArmed);
      expect(yield* Queue.size(reports)).toBe(0);

      const client = {
        [WS_METHODS.serverReportClientActivity]: (input: ClientActivityReportInput) =>
          Queue.offer(reports, input).pipe(Effect.asVoid),
      } satisfies Pick<WsRpcProtocolClient, typeof WS_METHODS.serverReportClientActivity>;
      yield* SubscriptionRef.set(
        session,
        Option.some({
          client: client as unknown as WsRpcProtocolClient,
          initialConfig: Effect.die("Activity reports do not read server config."),
          subscribeServerConfig: () => Stream.empty,
          ready: Effect.void,
          probe: Effect.void,
          closed: Effect.never,
        }),
      );
      yield* SubscriptionRef.update(state, (current) => ({
        ...current,
        phase: "connected" as const,
        generation: 1,
      }));
      yield* Queue.take(debounceArmed);
      yield* TestClock.adjust("250 millis");
      expect(yield* Queue.take(reports)).toMatchObject({
        environmentId,
        clientId: "mobile-test-device",
        visible: true,
        focused: true,
        appState: "active",
        scopes: [{ type: "provider-status" }],
      });
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("retains VCS demand only while the mobile subscription is active", () =>
    Effect.gen(function* () {
      const environmentId = EnvironmentId.make("mobile-environment");
      const release = yield* observeMobileBackgroundActivitySubscription({
        environmentId,
        method: WS_METHODS.subscribeVcsStatus,
        input: { cwd: "/workspace" },
      });

      expect(retainedMobileBackgroundScopes(environmentId)).toEqual([
        { type: "vcs-status", cwd: "/workspace" },
      ]);

      yield* release;
      expect(retainedMobileBackgroundScopes(environmentId)).toEqual([]);
    }),
  );

  it.effect("keeps delimiter-containing environment and scope values distinct", () =>
    Effect.gen(function* () {
      const firstEnvironmentId = EnvironmentId.make("a");
      const secondEnvironmentId = EnvironmentId.make("a:vcs-status:b");
      const releaseFirst = yield* observeMobileBackgroundActivitySubscription({
        environmentId: firstEnvironmentId,
        method: WS_METHODS.subscribeVcsStatus,
        input: { cwd: "b:vcs-status:c" },
      });
      const releaseSecond = yield* observeMobileBackgroundActivitySubscription({
        environmentId: secondEnvironmentId,
        method: WS_METHODS.subscribeVcsStatus,
        input: { cwd: "c" },
      });

      expect(retainedMobileBackgroundScopes(firstEnvironmentId)).toEqual([
        { type: "vcs-status", cwd: "b:vcs-status:c" },
      ]);
      expect(retainedMobileBackgroundScopes(secondEnvironmentId)).toEqual([
        { type: "vcs-status", cwd: "c" },
      ]);

      yield* Effect.all([releaseFirst, releaseSecond]);
    }),
  );

  it.effect("returns a release handle when a retained-scope listener throws", () =>
    Effect.gen(function* () {
      const environmentId = EnvironmentId.make("throwing-listener-environment");
      const removeListener = onRetainedMobileBackgroundScopesChange(() => {
        throw new Error("listener failed");
      });

      const release = yield* observeMobileBackgroundActivitySubscription({
        environmentId,
        method: WS_METHODS.subscribeVcsStatus,
        input: { cwd: "/workspace" },
      });
      expect(retainedMobileBackgroundScopes(environmentId)).toEqual([
        { type: "vcs-status", cwd: "/workspace" },
      ]);

      yield* release;
      expect(retainedMobileBackgroundScopes(environmentId)).toEqual([]);
      removeListener();
    }),
  );
});
