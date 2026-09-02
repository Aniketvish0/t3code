import { findErrorTraceId } from "@t3tools/client-runtime/errors";
import { managedRelaySessionAtom } from "@t3tools/client-runtime/relay";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import type { RelayClientEnvironmentRecord } from "@t3tools/contracts/relay";
import { useEffect, useRef, useState } from "react";

import { relayEnvironmentDiscovery } from "~/state/relay";
import { useAtomCommand } from "~/state/use-atom-command";
import { toastManager } from "../components/ui/toast";
import { appAtomRegistry } from "../rpc/atomRegistry";
import {
  deregisterManagedRelayEnvironmentCommand,
  useManagedRelayEnvironments,
} from "./managedRelayState";

export function useManagedRelayEnvironmentRemoval() {
  const environmentsState = useManagedRelayEnvironments();
  const removeEnvironmentCommand = useAtomCommand(deregisterManagedRelayEnvironmentCommand, {
    reportFailure: false,
  });
  const refreshDiscovery = useAtomCommand(relayEnvironmentDiscovery.refresh, {
    reportFailure: false,
  });
  const pendingRef = useRef(new Map<string, EnvironmentId>());
  const [confirmingEnvironmentId, setConfirmingEnvironmentId] = useState<EnvironmentId | null>(
    null,
  );
  const [pendingByAccount, setPendingByAccount] = useState<ReadonlyMap<string, EnvironmentId>>(
    () => new Map(),
  );
  const pendingEnvironmentId = environmentsState.accountId
    ? (pendingByAccount.get(environmentsState.accountId) ?? null)
    : null;
  useEffect(() => {
    setConfirmingEnvironmentId(null);
  }, [environmentsState.accountId]);

  /**
   * Revoke an environment's T3 Connect link for the whole account. Resolves
   * true when the relay accepted the removal for the account that is still
   * signed in, so callers can clean up device-local state.
   */
  const removeEnvironment = async (environment: RelayClientEnvironmentRecord): Promise<boolean> => {
    const accountId = environmentsState.accountId;
    if (!accountId || pendingRef.current.has(accountId)) return false;

    pendingRef.current.set(accountId, environment.environmentId);
    setPendingByAccount((current) => {
      const next = new Map(current);
      next.set(accountId, environment.environmentId);
      return next;
    });
    const result = await removeEnvironmentCommand({
      accountId,
      environmentId: environment.environmentId,
    });
    if (pendingRef.current.get(accountId) === environment.environmentId) {
      pendingRef.current.delete(accountId);
    }
    setPendingByAccount((current) => {
      if (current.get(accountId) !== environment.environmentId) return current;
      const next = new Map(current);
      next.delete(accountId);
      return next;
    });

    if (appAtomRegistry.get(managedRelaySessionAtom)?.accountId !== accountId) return false;
    if (result._tag === "Success") {
      setConfirmingEnvironmentId(null);
      environmentsState.refresh();
      void refreshDiscovery();
      toastManager.add(
        result.value.cleanupPending
          ? {
              type: "warning",
              title: "Removed from account, cleanup pending",
              description: `${environment.label} is removed from your account, but its tunnel was not deleted because the host was still running. Stop the host, then use Retry cleanup on its row.`,
            }
          : {
              type: "success",
              title: "Removed from T3 Connect account",
              description: `${environment.label} is no longer registered to this account.`,
            },
      );
      return true;
    }
    if (isAtomCommandInterrupted(result)) return false;

    const cause = squashAtomCommandFailure(result);
    const message = cause instanceof Error ? cause.message : "Could not remove the environment.";
    const traceId = findErrorTraceId(cause);
    console.error("[t3-connect] Could not remove account environment", {
      environmentId: environment.environmentId,
      message,
      traceId,
      cause,
    });
    toastManager.add({
      type: "error",
      title: environment.cleanupPending
        ? "Could not finish cleanup"
        : "Could not remove environment",
      description: message,
      data: traceId
        ? {
            secondaryActionProps: {
              children: "Copy trace ID",
              onClick: () => void navigator.clipboard?.writeText(traceId),
            },
          }
        : undefined,
    });
    return false;
  };

  return {
    environmentsState,
    confirmingEnvironmentId,
    pendingEnvironmentId,
    setConfirmingEnvironmentId,
    removeEnvironment,
  };
}
