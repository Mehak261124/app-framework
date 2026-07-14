import { domToPng } from "modern-screenshot";

/** Options for {@link captureView}. */
export interface CaptureViewOptions {
  /**
   * Cap the captured image width in pixels; a wider view is downscaled to fit
   * (a narrower one is never upscaled). Keeps the base64 payload small enough
   * to attach to a chat request. Default `1024`.
   */
  maxWidth?: number;
}

/**
 * Render a DOM element to a PNG `data:` URL — a screenshot of what the user
 * sees, for attaching to an AI request so a vision-capable model can reason
 * over the rendered dashboard.
 *
 * Uses `modern-screenshot` to rasterise the element (canvas widgets, SVG
 * charts, and DOM alike) same-origin, with no permission prompt. The result is
 * downscaled so its width does not exceed `maxWidth`.
 *
 * @param element - The DOM element to capture (typically the shell's main
 *   content region).
 * @param options - See {@link CaptureViewOptions}.
 * @returns A promise resolving to a `data:image/png;base64,…` URL.
 * @example
 * ```ts
 * const png = await captureView(mainRef.current, { maxWidth: 1024 });
 * ```
 */
export async function captureView(
  element: HTMLElement,
  { maxWidth = 1024 }: CaptureViewOptions = {},
): Promise<string> {
  const width = element.clientWidth || maxWidth;
  const scale = Math.min(1, maxWidth / width);
  return domToPng(element, { scale });
}
