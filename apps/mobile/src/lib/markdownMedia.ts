import {
  classifyMarkdownImageSource,
  markdownImageSourceFragment,
} from "@t3tools/client-runtime/markdown-images";
import type { AssetResource, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { normalizeNativeMarkdownUrl } from "@t3tools/mobile-markdown-text/links";
import { mediaMimeType, mediaMimeTypeFromExtension } from "@t3tools/shared/filePreview";
import {
  mediaFileReference,
  mediaReferenceFileName,
  mediaUrlReference,
} from "@t3tools/client-runtime/media-reference";

import type { FilePreviewSource } from "../components/FilePreviewModal";
import type { MediaVideoPreviewSource } from "./videoPreviewSource";
import type { MediaActionsSource } from "./mediaActions";

type MediaTargetResource = Extract<AssetResource, { readonly _tag: "media-file" }>;
type MediaTarget =
  | { readonly uri: string }
  | {
      readonly environmentId: EnvironmentId;
      readonly resource: MediaTargetResource;
      readonly srcFragment?: string;
    };

/** Resolves only explicit media references. Ordinary links keep their existing navigation. */
export function resolveMarkdownMediaPreview(
  href: string,
  input: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
    readonly workspaceRoot: string | null | undefined;
    /** Image syntax can target an endpoint without a recognizable extension. */
    readonly imageEmbed?: boolean;
  },
):
  | { readonly kind: "image"; readonly source: FilePreviewSource }
  | { readonly kind: "video"; readonly source: MediaVideoPreviewSource }
  | null {
  const classified = classifyMarkdownImageSource(href, input.workspaceRoot);
  if (classified._tag === "Blocked") return null;
  const path =
    classified._tag === "WorkspaceFile"
      ? classified.path.replace(/:\d+(?::\d+)?$/, "")
      : classified.uri.split(/[?#]/, 1)[0]!;
  const basename = path.split(/[\\/]/).at(-1) ?? "";
  const extensionIndex = basename.lastIndexOf(".");
  // Local paths have already been decoded. Do not interpret literal #, ?, or % characters again.
  const detectedMimeType =
    classified._tag === "Direct"
      ? mediaMimeType(classified.uri)
      : extensionIndex < 0
        ? null
        : mediaMimeTypeFromExtension(basename.slice(extensionIndex));
  const mimeType = detectedMimeType ?? (input.imageEmbed ? "image/*" : null);
  if (mimeType === null) return null;
  const kind = mimeType.startsWith("video/") ? "video" : "image";
  const reference =
    classified._tag === "Direct"
      ? mediaUrlReference(classified.uri)
      : mediaFileReference(path, input.workspaceRoot);
  const name =
    (reference && mediaReferenceFileName(reference)) || (kind === "video" ? "Video" : "Image");
  const srcFragment = markdownImageSourceFragment(href);
  let target: MediaTarget;
  let actionsSource: MediaActionsSource;
  if (classified._tag === "Direct") {
    target = { uri: normalizeNativeMarkdownUrl(classified.uri) };
    actionsSource = { reference, uri: classified.uri, name, mimeType };
  } else {
    const resource: MediaTargetResource = { _tag: "media-file", threadId: input.threadId, path };
    target = {
      environmentId: input.environmentId,
      resource,
      ...(srcFragment ? { srcFragment } : {}),
    };
    actionsSource = {
      reference,
      environmentId: input.environmentId,
      threadId: input.threadId,
      resource,
      name,
      mimeType,
    };
  }
  return kind === "video"
    ? {
        kind,
        source: { type: "media", name, mimeType, ...target, actionsSource },
      }
    : {
        kind,
        source: { kind, name, ...target, actionsSource },
      };
}
