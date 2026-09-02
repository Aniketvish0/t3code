import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import type { RelayClientEnvironmentRecord } from "@t3tools/contracts/relay";
import { EllipsisIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import { useManagedRelayEnvironmentRemoval } from "~/cloud/useManagedRelayEnvironmentRemoval";
import { useAtomCommand } from "~/state/use-atom-command";
import { ConnectionStatusDot } from "../ConnectionStatusDot";
import { ITEM_ROW_CLASSNAME, ITEM_ROW_INNER_CLASSNAME } from "../settings/itemRows";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";

interface DialogSelection {
  readonly accountId: string;
  readonly environment: RelayClientEnvironmentRecord;
  /** True when this client is connected to the environment through T3 Connect. */
  readonly connectedOnDevice: boolean;
}

/**
 * Account-level actions for the Remote environments list. Device-level
 * connect, disconnect, and remove live on the rows themselves. This hook adds
 * the one action that reaches past this device: removing the environment from
 * the signed-in T3 Connect account. It also exposes the account rows whose
 * tunnel cleanup is still pending, since those no longer appear in discovery.
 *
 * Render `dialog` once near the list. Rows get a menu through `menuFor`.
 */
export function useAccountEnvironmentActions() {
  const removal = useManagedRelayEnvironmentRemoval();
  const { environmentsState, pendingEnvironmentId } = removal;
  const forgetOnDevice = useAtomCommand(environmentCatalog.remove, { reportFailure: false });
  const [selection, setSelection] = useState<DialogSelection | null>(null);

  const accountId = environmentsState.accountId;
  const accountEnvironments = environmentsState.data;
  const byId = useMemo(
    () =>
      new Map(
        (accountEnvironments ?? []).map((environment) => [environment.environmentId, environment]),
      ),
    [accountEnvironments],
  );
  const cleanupPendingEnvironments = useMemo(
    () => (accountEnvironments ?? []).filter((environment) => environment.cleanupPending === true),
    [accountEnvironments],
  );

  const mutationPending = pendingEnvironmentId !== null;
  const selected = selection?.environment ?? null;
  const dialogOpen =
    selection?.accountId === accountId &&
    removal.confirmingEnvironmentId === selected?.environmentId;

  const open = (environmentId: EnvironmentId, connectedOnDevice: boolean) => {
    const environment = byId.get(environmentId);
    if (!accountId || !environment) return;
    setSelection({ accountId, environment, connectedOnDevice });
    removal.setConfirmingEnvironmentId(environmentId);
  };

  const confirm = async () => {
    if (!selection || selection.accountId !== accountId || !selected) return;
    const removed = await removal.removeEnvironment(selected);
    if (!removed || !selection.connectedOnDevice) return;
    // The relay link is gone, so the saved T3 Connect connection on this
    // device can only fail. Drop it instead of leaving a dead row.
    const forgotten = await forgetOnDevice(selected.environmentId);
    if (forgotten._tag === "Failure" && !isAtomCommandInterrupted(forgotten)) {
      const cause = squashAtomCommandFailure(forgotten);
      toastManager.add({
        type: "error",
        title: "Removed from account, still saved on this device",
        description: `${cause instanceof Error ? cause.message : "Could not forget the connection."} Use Remove on its row to retry.`,
      });
    }
  };

  const menuFor = (environmentId: EnvironmentId, options: { connectedOnDevice: boolean }) => {
    const environment = byId.get(environmentId);
    if (!accountId || !environment) return null;
    const cleanup = environment.cleanupPending === true;
    return (
      <Menu>
        <MenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-foreground"
              disabled={mutationPending}
              aria-label={`T3 Connect account actions for ${environment.label}`}
            />
          }
        >
          <EllipsisIcon className="size-3.5" />
        </MenuTrigger>
        <MenuPopup align="end" className="min-w-56">
          <MenuItem
            variant={cleanup ? "default" : "destructive"}
            disabled={mutationPending}
            onClick={() => open(environmentId, options.connectedOnDevice)}
          >
            {cleanup ? "Retry cleanup" : "Remove from T3 Connect account"}
          </MenuItem>
        </MenuPopup>
      </Menu>
    );
  };

  const dialog = (
    <AlertDialog
      open={dialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !mutationPending) removal.setConfirmingEnvironmentId(null);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) setSelection(null);
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {selected?.cleanupPending
              ? "Retry T3 Connect cleanup?"
              : `Remove ${selected?.label ?? "environment"} from your T3 Connect account?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {selected?.cleanupPending
              ? `${selected.label} is already removed from your account, but its tunnel was not deleted because the host was still running. Stop the host, then retry.`
              : "This revokes the environment's T3 Connect link for every device on your account and stops activity publishing. Files, agents, and direct connections are not changed. Relink from the host to restore it."}
            {selection?.connectedOnDevice && !selected?.cleanupPending
              ? " This client is connected to it through T3 Connect. That connection closes and the environment leaves this list."
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose
            render={<Button variant="outline" disabled={mutationPending} />}
            disabled={mutationPending}
          >
            Cancel
          </AlertDialogClose>
          <Button
            className="min-w-44"
            variant="destructive"
            disabled={mutationPending || selected === null}
            aria-busy={mutationPending}
            onClick={() => void confirm()}
          >
            {mutationPending
              ? selected?.cleanupPending
                ? "Retrying cleanup..."
                : "Removing..."
              : selected?.cleanupPending
                ? "Retry cleanup"
                : "Remove from account"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );

  return {
    accountId,
    cleanupPendingEnvironments,
    error: environmentsState.error,
    refresh: environmentsState.refresh,
    menuFor,
    dialog,
  };
}

/**
 * Row for an environment that is already removed from the account but whose
 * managed tunnel could not be deleted while the host was running. It stays in
 * the list until cleanup succeeds, so the user can see it and retry.
 */
export function CleanupPendingEnvironmentRow({
  environment,
  menu,
}: {
  readonly environment: RelayClientEnvironmentRecord;
  readonly menu: React.ReactNode;
}) {
  return (
    <div className={ITEM_ROW_CLASSNAME}>
      <div className={ITEM_ROW_INNER_CLASSNAME}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ConnectionStatusDot
              dotClassName="bg-muted-foreground/35"
              tooltipText="Removed from account"
            />
            <p className="truncate text-sm font-medium">{environment.label}</p>
          </div>
          <p className="mt-1 text-xs text-warning">Removed from account · Cleanup pending</p>
        </div>
        {menu}
      </div>
    </div>
  );
}

export function AccountEnvironmentsError({
  error,
  refresh,
}: {
  readonly error: string;
  readonly refresh: () => void;
}) {
  return (
    <div className={ITEM_ROW_CLASSNAME} role="alert">
      <p className="text-sm font-medium text-destructive">
        Could not load T3 Connect account environments
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={refresh}>
        Try again
      </Button>
    </div>
  );
}
