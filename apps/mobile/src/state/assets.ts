import { useAtomValue } from "@effect/atom-react";
import {
  type AssetUrlState,
  assetUrlStateFromResult,
  createAssetEnvironmentAtoms,
  EMPTY_ASSET_URL_ATOM,
  resolveAssetUrlResult,
} from "@t3tools/client-runtime/state/assets";
import type { AssetResource, EnvironmentId } from "@t3tools/contracts";
import { useCallback } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { usePreparedConnection } from "./session";
import { useAtomQueryRunner } from "./use-atom-query-runner";

export type { AssetUrlState } from "@t3tools/client-runtime/state/assets";

export const assetEnvironment = createAssetEnvironmentAtoms(connectionAtomRuntime);

export function useAssetUrlState(
  environmentId: EnvironmentId | null,
  resource: AssetResource | null,
): AssetUrlState {
  const preparedConnection = usePreparedConnection(environmentId);
  const result = useAtomValue(
    environmentId === null || resource === null
      ? EMPTY_ASSET_URL_ATOM
      : assetEnvironment.createUrl({ environmentId, input: { resource } }),
  );
  return assetUrlStateFromResult(
    result,
    preparedConnection._tag === "Some" ? preparedConnection.value.httpBaseUrl : null,
  );
}

export function useAssetUrl(
  environmentId: EnvironmentId | null,
  resource: AssetResource | null,
): string | null {
  const state = useAssetUrlState(environmentId, resource);
  return state._tag === "Success" ? state.url : null;
}

/**
 * Explicit playback and sharing must reauthorize files that may have been
 * replaced on disk. Returns null instead of throwing: native players and share
 * sheets show their own unavailable state and have no retry affordance to explain to.
 */
export function useRefreshAssetUrl(
  environmentId: EnvironmentId | null,
  resource: AssetResource | null,
): () => Promise<string | null> {
  const connection = usePreparedConnection(environmentId);
  const httpBaseUrl = connection._tag === "Some" ? connection.value.httpBaseUrl : null;
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    refresh: true,
    reportFailure: false,
  });
  return useCallback(async () => {
    if (environmentId === null || resource === null || httpBaseUrl === null) return null;
    return resolveAssetUrlResult(
      await createUrl({ environmentId, input: { resource } }),
      httpBaseUrl,
    );
  }, [createUrl, environmentId, httpBaseUrl, resource]);
}
