import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetLoader, type SctManifest } from "./widgetLoader";
import { WidgetRegistry } from "./widgetRegistry";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANIFEST_URL = "/sct-manifest.json";

const SAMPLE_MANIFEST: SctManifest = {
  version: "1",
  widgets: [
    {
      name: "LogViewer",
      description: "Log viewer widget",
      channelPattern: "log/*",
      consumes: ["text/plain"],
      priority: 10,
      defaultRegion: "bottom",
      parameters: { maxLines: { type: "integer", default: 1000 } },
      module: "./LogViewer",
      export: "LogViewerComponent",
    },
    {
      name: "StatusIndicator",
      description: "Status indicator widget",
      channelPattern: "control/*",
      consumes: ["application/x-control+json"],
      priority: 10,
      defaultRegion: "status-bar",
      parameters: {},
      module: "./StatusIndicator",
      export: "StatusIndicatorComponent",
    },
  ],
};

function mockFetchManifest(manifest: SctManifest): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifest),
    }),
  );
}

function mockFetchFailure(message = "Network error"): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(message)));
}

function makeImportFn(exports: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue(exports);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WidgetLoader", () => {
  beforeEach(() => {
    vi.stubGlobal("console", {
      ...console,
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadManifest registers all declared widgets", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const loader = new WidgetLoader(registry);

    await loader.loadManifest(MANIFEST_URL);

    expect(registry.get("LogViewer")).toBeDefined();
    expect(registry.get("StatusIndicator")).toBeDefined();
  });

  it("metadata fields are available immediately after loadManifest resolves", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const loader = new WidgetLoader(registry);

    await loader.loadManifest(MANIFEST_URL);

    const lv = registry.get("LogViewer")!;
    expect(lv.name).toBe("LogViewer");
    expect(lv.description).toBe("Log viewer widget");
    expect(lv.channelPattern).toBe("log/*");
    expect(lv.defaultRegion).toBe("bottom");

    const si = registry.get("StatusIndicator")!;
    expect(si.defaultRegion).toBe("status-bar");
  });

  it("factory calls trigger dynamic import", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const FakeComponent = () => null;
    const importFn = makeImportFn({ LogViewerComponent: FakeComponent });
    const loader = new WidgetLoader(registry, importFn);

    await loader.loadManifest(MANIFEST_URL);

    const def = registry.get("LogViewer")!;
    expect(importFn).not.toHaveBeenCalled();

    await def.factory({ parameters: {} });
    expect(importFn).toHaveBeenCalledWith("./LogViewer");
  });

  it("factory is cached — second call reuses the first import promise", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const FakeComponent = () => null;
    const importFn = makeImportFn({ LogViewerComponent: FakeComponent });
    const loader = new WidgetLoader(registry, importFn);

    await loader.loadManifest(MANIFEST_URL);

    const def = registry.get("LogViewer")!;
    await def.factory({ parameters: {} });
    await def.factory({ parameters: {} });

    expect(importFn).toHaveBeenCalledTimes(1);
  });

  it("duplicate widget name is skipped with console.warn and does not throw", async () => {
    const registry = new WidgetRegistry();
    // Pre-register LogViewer so it's a duplicate.
    registry.register({
      name: "LogViewer",
      description: "pre-existing",
      channelPattern: "log/*",
      consumes: ["text/plain"],
      priority: 5,
      parameters: {},
      factory: () => () => null,
    });

    mockFetchManifest(SAMPLE_MANIFEST);
    const loader = new WidgetLoader(registry);

    await expect(loader.loadManifest(MANIFEST_URL)).resolves.toBeUndefined();

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("LogViewer"));
    // StatusIndicator was not pre-registered — it should still be registered.
    expect(registry.get("StatusIndicator")).toBeDefined();
  });

  it("manifest fetch failure rejects loadManifest with descriptive error", async () => {
    const registry = new WidgetRegistry();
    mockFetchFailure("connection refused");
    const loader = new WidgetLoader(registry);

    await expect(loader.loadManifest(MANIFEST_URL)).rejects.toThrow(
      "connection refused",
    );
  });

  it("non-ok HTTP response rejects loadManifest with descriptive error", async () => {
    const registry = new WidgetRegistry();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }),
    );
    const loader = new WidgetLoader(registry);

    await expect(loader.loadManifest(MANIFEST_URL)).rejects.toThrow("404");
  });

  it("loadManifest called twice rejects with 'manifest already loaded'", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const loader = new WidgetLoader(registry);

    await loader.loadManifest(MANIFEST_URL);

    await expect(loader.loadManifest(MANIFEST_URL)).rejects.toThrow(
      "manifest already loaded",
    );
  });

  it("dispose unregisters all loaded widgets", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const loader = new WidgetLoader(registry);

    await loader.loadManifest(MANIFEST_URL);
    expect(registry.list()).toHaveLength(2);

    loader.dispose();
    expect(registry.list()).toHaveLength(0);
  });

  it("dispose after dispose is a no-op", async () => {
    const registry = new WidgetRegistry();
    mockFetchManifest(SAMPLE_MANIFEST);
    const loader = new WidgetLoader(registry);

    await loader.loadManifest(MANIFEST_URL);
    loader.dispose();

    expect(() => loader.dispose()).not.toThrow();
    expect(registry.list()).toHaveLength(0);
  });
});
