import type { PreviewViewportSetting } from "@t3tools/contracts";

import { browserViewportSettingKey } from "~/browser/browserViewportLayout";

export async function applyPreviewViewportRollback(options: {
  readonly previous: PreviewViewportSetting;
  readonly requested: PreviewViewportSetting;
  readonly applyGuest: (setting: PreviewViewportSetting) => Promise<void>;
  readonly rollbackServer: () => Promise<boolean>;
}): Promise<void> {
  void options.applyGuest(options.previous).catch(() => undefined);
  let serverRolledBack = false;
  try {
    serverRolledBack = await options.rollbackServer();
  } finally {
    if (!serverRolledBack) {
      void options.applyGuest(options.requested).catch(() => undefined);
    }
  }
}

export function shouldRollbackPreviewViewport(
  previous: PreviewViewportSetting,
  requested: PreviewViewportSetting,
  latest: PreviewViewportSetting,
  operationServerEpoch: string | null,
  currentServerEpoch: string | null,
): boolean {
  const requestedKey = browserViewportSettingKey(requested);
  return (
    currentServerEpoch === operationServerEpoch &&
    browserViewportSettingKey(latest) === requestedKey &&
    browserViewportSettingKey(previous) !== requestedKey
  );
}
