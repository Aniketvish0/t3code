import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@t3tools/client-runtime/state/runtime";
import * as Effect from "effect/Effect";

import { connectionAtomRuntime } from "../connection/runtime";
import {
  linkPrimaryEnvironmentToCloud,
  type CloudLinkMode,
  type CloudLinkTarget,
  unlinkPrimaryEnvironmentFromCloud,
  updatePrimaryCloudPreferences,
} from "./linkEnvironment";
import { managedRelayQueryManager } from "./managedRelayState";

const cloudLinkScheduler = createAtomCommandScheduler();
const cloudLinkConcurrency = {
  mode: "serial" as const,
  key: (input: { readonly target: CloudLinkTarget }) => input.target.environmentId,
};

export const linkPrimaryEnvironment = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:link-primary-environment",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (
    input: {
      readonly target: CloudLinkTarget;
      readonly clerkToken: string;
      readonly mode?: CloudLinkMode;
    },
    registry,
  ) =>
    linkPrimaryEnvironmentToCloud(input).pipe(
      Effect.tap((accountId) =>
        Effect.sync(() => managedRelayQueryManager.discardEnvironments(registry, accountId)),
      ),
    ),
});

export const unlinkPrimaryEnvironment = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:unlink-primary-environment",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (input: { readonly target: CloudLinkTarget; readonly clerkToken: string | null }) =>
    unlinkPrimaryEnvironmentFromCloud(input),
});

export const updatePrimaryEnvironmentPreferences = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:cloud:update-primary-environment-preferences",
  scheduler: cloudLinkScheduler,
  concurrency: cloudLinkConcurrency,
  execute: (input: { readonly target: CloudLinkTarget; readonly publishAgentActivity: boolean }) =>
    updatePrimaryCloudPreferences(input),
});
