import React, { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventBusProvider } from "./EventBusContext";
import { WidgetRegistryContext } from "./WidgetRegistryContext";
import type { WebSocketLike } from "./client";
import { useWidgetLoader } from "./useWidgetLoader";
import { WidgetRegistry } from "./widgetRegistry";
import type { SctManifest } from "./widgetLoader";

// ─── FakeWebSocket ────────────────────────────────────────────────────────────

class FakeWebSocket implements WebSocketLike {
  public static readonly OPEN = 1;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public readyState = FakeWebSocket.OPEN;
  public readonly sent: string[] = [];
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.onclose?.({} as CloseEvent);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANIFEST_URL = "/sct-manifest.json";

const EMPTY_MANIFEST: SctManifest = { version: "1", widgets: [] };

function mockFetchManifest(manifest: SctManifest): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(manifest),
    }),
  );
}

function mockFetchFailure(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
}

// ─── Test harness ─────────────────────────────────────────────────────────────

type Status = "loading" | "ready" | "error";

function Probe({ onStatus }: { onStatus: (s: Status) => void }): JSX.Element | null {
  const status = useWidgetLoader(MANIFEST_URL);
  useEffect(() => {
    onStatus(status);
  }, [status, onStatus]);
  return null;
}

function makeTree(
  registry: WidgetRegistry,
  onStatus: (s: Status) => void,
): JSX.Element {
  const socket = new FakeWebSocket();
  return (
    <WidgetRegistryContext.Provider value={registry}>
      <EventBusProvider path="/ws" webSocketFactory={() => socket}>
        <Probe onStatus={onStatus} />
      </EventBusProvider>
    </WidgetRegistryContext.Provider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useWidgetLoader", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:5173" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "loading" immediately after mount', () => {
    mockFetchManifest(EMPTY_MANIFEST);
    const registry = new WidgetRegistry();
    const statuses: Status[] = [];

    act(() => {
      create(makeTree(registry, (s) => statuses.push(s)));
    });

    expect(statuses[0]).toBe("loading");
  });

  it('returns "ready" after manifest loads', async () => {
    mockFetchManifest(EMPTY_MANIFEST);
    const registry = new WidgetRegistry();
    const statuses: Status[] = [];

    act(() => {
      create(makeTree(registry, (s) => statuses.push(s)));
    });

    // Flush promises
    await act(async () => {
      await Promise.resolve();
    });

    expect(statuses).toContain("ready");
  });

  it('returns "error" when manifest load fails', async () => {
    mockFetchFailure();
    const registry = new WidgetRegistry();
    const statuses: Status[] = [];

    act(() => {
      create(makeTree(registry, (s) => statuses.push(s)));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(statuses).toContain("error");
  });

  it("calls loader.dispose() on unmount", async () => {
    mockFetchManifest({
      version: "1",
      widgets: [
        {
          name: "TestWidget",
          description: "test",
          channelPattern: "test/*",
          consumes: ["text/plain"],
          priority: 1,
          parameters: {},
          module: "./Test",
          export: "TestComponent",
        },
      ],
    });

    const registry = new WidgetRegistry();
    const statuses: Status[] = [];
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(makeTree(registry, (s) => statuses.push(s)));
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Widget should be registered after load
    expect(registry.get("TestWidget")).toBeDefined();

    // Unmount — loader.dispose() should unregister the widget
    act(() => {
      renderer!.unmount();
    });

    expect(registry.get("TestWidget")).toBeUndefined();
  });

  it("re-renders when manifest loading completes", async () => {
    mockFetchManifest(EMPTY_MANIFEST);
    const registry = new WidgetRegistry();
    const statuses: Status[] = [];

    act(() => {
      create(makeTree(registry, (s) => statuses.push(s)));
    });

    await act(async () => {
      await Promise.resolve();
    });

    // Should have transitioned from "loading" → "ready"
    expect(statuses).toEqual(expect.arrayContaining(["loading", "ready"]));
    const loadingIdx = statuses.indexOf("loading");
    const readyIdx = statuses.lastIndexOf("ready");
    expect(readyIdx).toBeGreaterThan(loadingIdx);
  });
});
