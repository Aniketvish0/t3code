import { describe, expect, it } from "vite-plus/test";

import { availableMediaActions } from "./mediaActions.ts";

const workspaceFile = { kind: "file", path: "/repo/a.png", relativePath: "a.png" } as const;
const hostFile = { kind: "file", path: "/tmp/a.png" } as const;
const url = { kind: "url", url: "https://cdn.example.com/a.png" } as const;

describe("availableMediaActions", () => {
  it("offers both path copies and open-file for a workspace image", () => {
    expect(
      availableMediaActions({
        kind: "image",
        reference: workspaceFile,
        canOpenFile: true,
        canFetchBytes: true,
        canCopyImage: true,
      }).map((action) => action.id),
    ).toEqual(["copy-full-path", "copy-relative-path", "open-file", "save", "copy-image"]);
  });

  it("drops the relative copy and open-file for a host file outside the workspace", () => {
    expect(
      availableMediaActions({
        kind: "image",
        reference: hostFile,
        canOpenFile: false,
        canFetchBytes: true,
        canCopyImage: true,
      }).map((action) => action.id),
    ).toEqual(["copy-full-path", "save", "copy-image"]);
  });

  it("offers a URL copy and save for a remote video, never copy-image", () => {
    expect(
      availableMediaActions({
        kind: "video",
        reference: url,
        canOpenFile: false,
        canFetchBytes: true,
        canCopyImage: true,
      }).map((action) => action.id),
    ).toEqual(["copy-url", "save"]);
  });

  it("keeps save visible but disabled while there is nothing to fetch", () => {
    expect(
      availableMediaActions({
        kind: "video",
        reference: undefined,
        canOpenFile: false,
        canFetchBytes: false,
        canCopyImage: false,
      }),
    ).toEqual([{ id: "save", disabled: true }]);
  });

  it("omits copy-image where the platform cannot write image bytes to the clipboard", () => {
    expect(
      availableMediaActions({
        kind: "image",
        reference: url,
        canOpenFile: false,
        canFetchBytes: true,
        canCopyImage: false,
      }).map((action) => action.id),
    ).toEqual(["copy-url", "save"]);
  });
});
