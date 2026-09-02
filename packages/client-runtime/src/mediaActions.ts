import type { MediaReference } from "./mediaReference.ts";

export type MediaActionId =
  | "copy-full-path"
  | "copy-relative-path"
  | "copy-url"
  | "open-file"
  | "save"
  | "copy-image";

export interface MediaActionAvailabilityInput {
  readonly kind: "image" | "video";
  readonly reference: MediaReference | undefined;
  /** Whether the client can turn this media into a file viewer location. */
  readonly canOpenFile: boolean;
  /** Whether the client has, or can mint, a URL to fetch the bytes from. */
  readonly canFetchBytes: boolean;
  /** Whether the platform can put image bytes on the clipboard. */
  readonly canCopyImage: boolean;
}

export interface MediaActionAvailability {
  readonly id: MediaActionId;
  /** Present in the menu but not runnable right now, so the user learns the action exists. */
  readonly disabled: boolean;
}

/**
 * Which actions a media element offers, in menu order. Clients render these
 * with their own labels and run them with their own clipboard, download, and
 * navigation code; the set itself is the same on every surface.
 */
export function availableMediaActions(
  input: MediaActionAvailabilityInput,
): ReadonlyArray<MediaActionAvailability> {
  const actions: MediaActionAvailability[] = [];
  const reference = input.reference;
  if (reference?.kind === "file") {
    actions.push({ id: "copy-full-path", disabled: false });
    if (reference.relativePath) actions.push({ id: "copy-relative-path", disabled: false });
  } else if (reference?.kind === "url") {
    actions.push({ id: "copy-url", disabled: false });
  }
  if (input.canOpenFile) actions.push({ id: "open-file", disabled: false });
  actions.push({ id: "save", disabled: !input.canFetchBytes });
  if (input.kind === "image" && input.canCopyImage) {
    actions.push({ id: "copy-image", disabled: !input.canFetchBytes });
  }
  return actions;
}
