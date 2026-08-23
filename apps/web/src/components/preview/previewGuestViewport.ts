import type { PreviewViewportSetting } from "@t3tools/contracts";

export type PreviewGuestViewportOverride =
  | { readonly clear: true }
  | { readonly width: number; readonly height: number };

export type PreviewGuestViewportApplier = (
  tabId: string,
  input: PreviewGuestViewportOverride,
) => Promise<void>;

/** Keep in sync with PreviewManager.deviceMetricsOverride. */
const PREVIEW_GUEST_MOBILE_MAX_SHORTEST_SIDE = 768;

const normalizeZoomFactor = (zoomFactor: number): number =>
  Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;

/** Shortest side, so landscape phones stay mobile (844x390, not width-only). */
export function previewGuestViewportIsMobile(width: number, height: number): boolean {
  return Math.min(width, height) < PREVIEW_GUEST_MOBILE_MAX_SHORTEST_SIDE;
}

/** Maps a stored viewport setting onto the desktop CDP override. */
export function previewGuestViewportOverride(
  setting: PreviewViewportSetting,
  zoomFactor = 1,
): PreviewGuestViewportOverride {
  if (setting._tag === "fill") return { clear: true };
  const zoom = normalizeZoomFactor(zoomFactor);
  // The override is a widget DIP size; page zoom still divides it. Mobile
  // emulation pins page zoom to 1, so those sizes stay in CSS pixels.
  const scale = previewGuestViewportIsMobile(setting.width, setting.height) ? 1 : zoom;
  return {
    width: Math.max(1, Math.round(setting.width * scale)),
    height: Math.max(1, Math.round(setting.height * scale)),
  };
}

/** Applies or clears the guest CDP metrics override. No-op on older desktops. */
export async function applyPreviewGuestViewport(
  setViewport: PreviewGuestViewportApplier | undefined,
  tabId: string,
  setting: PreviewViewportSetting,
  zoomFactor = 1,
): Promise<void> {
  if (!setViewport) return;
  await setViewport(tabId, previewGuestViewportOverride(setting, zoomFactor));
}
