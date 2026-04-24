import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";

import { ApplicationShell } from "./ApplicationShell";
import { WidgetRegistryContext } from "./WidgetRegistryContext";
import { WidgetRegistry } from "./widgetRegistry";
import type { ShellLayout } from "./shellTypes";
import { createDefaultShellLayout } from "./shellTypes";
import { useShellLayout } from "./useShellLayout";
import { useShellLayoutStore } from "./shellStore";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRegistry(): WidgetRegistry {
  return new WidgetRegistry();
}

// Reset Zustand store before each test — store is a singleton
beforeEach(() => {
  useShellLayoutStore.setState({ layout: createDefaultShellLayout() });
});

// ─── useShellLayout tests ─────────────────────────────────────────────────────

describe("useShellLayout", () => {
  it("returns initial layout with all 6 regions", () => {
    const seen: ShellLayout[] = [];

    function Probe(): null {
      const [layout] = useShellLayout();
      useEffect(() => {
        seen.push(layout);
      }, [layout]);
      return null;
    }

    act(() => {
      create(
        <WidgetRegistryContext.Provider value={makeRegistry()}>
          <ApplicationShell />
          <Probe />
        </WidgetRegistryContext.Provider>,
      );
    });

    const layout = seen.at(-1)!;
    const regionKeys = Object.keys(layout.regions);
    expect(regionKeys).toHaveLength(6);
    expect(regionKeys).toContain("header");
    expect(regionKeys).toContain("sidebar-left");
    expect(regionKeys).toContain("main");
    expect(regionKeys).toContain("sidebar-right");
    expect(regionKeys).toContain("bottom");
    expect(regionKeys).toContain("status-bar");
  });

  it("calling setLayout with identity updater does not mutate the layout reference", () => {
    const seen: ShellLayout[] = [];
    let capturedSetter: ((updater: (prev: ShellLayout) => ShellLayout) => void) | null =
      null;

    function Probe(): null {
      const [layout, setLayout] = useShellLayout();
      useEffect(() => {
        seen.push(layout);
      }, [layout]);
      useEffect(() => {
        capturedSetter = setLayout;
      }, [setLayout]);
      return null;
    }

    act(() => {
      create(
        <WidgetRegistryContext.Provider value={makeRegistry()}>
          <ApplicationShell />
          <Probe />
        </WidgetRegistryContext.Provider>,
      );
    });

    const layoutBefore = seen.at(-1)!;
    expect(capturedSetter).not.toBeNull();

    act(() => {
      capturedSetter!((prev) => prev);
    });

    expect(seen.at(-1)).toBe(layoutBefore);
  });

  it("setLayout updater mutates layout — sidebar-right becomes visible", () => {
    const seen: ShellLayout[] = [];
    let capturedSetter: ((updater: (prev: ShellLayout) => ShellLayout) => void) | null =
      null;

    function Probe(): null {
      const [layout, setLayout] = useShellLayout();
      useEffect(() => {
        seen.push(layout);
      }, [layout]);
      useEffect(() => {
        capturedSetter = setLayout;
      }, [setLayout]);
      return null;
    }

    act(() => {
      create(
        <WidgetRegistryContext.Provider value={makeRegistry()}>
          <ApplicationShell />
          <Probe />
        </WidgetRegistryContext.Provider>,
      );
    });

    expect(seen.at(-1)!.regions["sidebar-right"].visible).toBe(false);

    act(() => {
      capturedSetter!((prev) => ({
        ...prev,
        regions: {
          ...prev.regions,
          "sidebar-right": {
            ...prev.regions["sidebar-right"],
            visible: true,
          },
        },
      }));
    });

    expect(seen.at(-1)!.regions["sidebar-right"].visible).toBe(true);
  });

  it("re-renders on layout change", () => {
    let renderCount = 0;
    let capturedSetter: ((updater: (prev: ShellLayout) => ShellLayout) => void) | null =
      null;

    function Probe(): null {
      const [, setLayout] = useShellLayout();
      renderCount += 1;
      useEffect(() => {
        capturedSetter = setLayout;
      }, [setLayout]);
      return null;
    }

    act(() => {
      create(
        <WidgetRegistryContext.Provider value={makeRegistry()}>
          <ApplicationShell />
          <Probe />
        </WidgetRegistryContext.Provider>,
      );
    });

    const countAfterMount = renderCount;

    act(() => {
      capturedSetter!((prev) => ({
        ...prev,
        regions: {
          ...prev.regions,
          bottom: { ...prev.regions.bottom, visible: true },
        },
      }));
    });

    expect(renderCount).toBeGreaterThan(countAfterMount);
  });

  it("useShellLayout works outside ApplicationShell — no throw with Zustand", () => {
    function Probe(): null {
      useShellLayout();
      return null;
    }

    expect(() => {
      act(() => {
        create(
          <WidgetRegistryContext.Provider value={new WidgetRegistry()}>
            <Probe />
          </WidgetRegistryContext.Provider>,
        );
      });
    }).not.toThrow();
  });
});
