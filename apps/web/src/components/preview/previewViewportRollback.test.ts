import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyPreviewViewportRollback,
  shouldRollbackPreviewViewport,
} from "./previewViewportRollback";

describe("shouldRollbackPreviewViewport", () => {
  const fill = { _tag: "fill" } as const;
  const requested = { _tag: "freeform", width: 900, height: 600 } as const;

  it("rolls back a timed-out request that still owns the latest setting", () => {
    expect(shouldRollbackPreviewViewport(fill, requested, requested, "server-a", "server-a")).toBe(
      true,
    );
  });

  it("does not overwrite a newer resize, replacement server, or repeated setting", () => {
    expect(
      shouldRollbackPreviewViewport(
        fill,
        requested,
        {
          _tag: "freeform",
          width: 1024,
          height: 768,
        },
        "server-a",
        "server-a",
      ),
    ).toBe(false);
    expect(shouldRollbackPreviewViewport(fill, requested, requested, "server-a", "server-b")).toBe(
      false,
    );
    expect(
      shouldRollbackPreviewViewport(requested, requested, requested, "server-a", "server-a"),
    ).toBe(false);
  });

  it("restores the requested guest size when the server rollback fails", async () => {
    const previous = { _tag: "freeform", width: 800, height: 600 } as const;
    const applyGuest = vi.fn(async () => undefined);

    await applyPreviewViewportRollback({
      previous,
      requested,
      applyGuest,
      rollbackServer: async () => false,
    });

    expect(applyGuest).toHaveBeenNthCalledWith(1, previous);
    expect(applyGuest).toHaveBeenNthCalledWith(2, requested);
  });

  it("restores the requested guest size when the server rollback throws", async () => {
    const previous = { _tag: "freeform", width: 800, height: 600 } as const;
    const applyGuest = vi.fn(async () => undefined);

    await expect(
      applyPreviewViewportRollback({
        previous,
        requested,
        applyGuest,
        rollbackServer: async () => {
          throw new Error("rollback unavailable");
        },
      }),
    ).rejects.toThrow("rollback unavailable");
    expect(applyGuest).toHaveBeenNthCalledWith(1, previous);
    expect(applyGuest).toHaveBeenNthCalledWith(2, requested);
  });
});
