import { describe, expect, it, vi } from "vitest";

// Mock the DOM-to-image library so the util can be unit-tested without a real
// rasterisation pass.
vi.mock("modern-screenshot", () => ({
  domToPng: vi.fn(async () => "data:image/png;base64,MOCK"),
}));

import { domToPng } from "modern-screenshot";
import { captureView } from "./captureView";

function elementOfWidth(clientWidth: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: clientWidth });
  return el;
}

describe("captureView", () => {
  it("resolves to the PNG data URL produced by the library", async () => {
    const url = await captureView(elementOfWidth(800));
    expect(url).toBe("data:image/png;base64,MOCK");
  });

  it("downscales a wide view so the capture width is capped", async () => {
    await captureView(elementOfWidth(2048), { maxWidth: 1024 });
    expect(domToPng).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ scale: 0.5 }),
    );
  });

  it("never upscales a view narrower than maxWidth (scale ≤ 1)", async () => {
    await captureView(elementOfWidth(400), { maxWidth: 1024 });
    const calls = vi.mocked(domToPng).mock.calls as unknown as [
      unknown,
      { scale: number },
    ][];
    expect(calls[calls.length - 1][1].scale).toBeLessThanOrEqual(1);
  });
});
