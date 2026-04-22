import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";

import { ApplicationShell } from "./ApplicationShell";
import { createDefaultShellLayout } from "./shellTypes";
import type { ShellLayout } from "./shellTypes";
import { WidgetRegistryContext } from "./WidgetRegistryContext";
import { WidgetRegistry } from "./widgetRegistry";
import type { WidgetDefinition } from "./widgetRegistry";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeWidget(
  name: string,
  defaultRegion?: WidgetDefinition["defaultRegion"],
): WidgetDefinition {
  return {
    name,
    description: `Test widget ${name}`,
    channelPattern: "data/*",
    consumes: ["text/plain"],
    priority: 10,
    parameters: {},
    defaultRegion,
    factory: () => () => null,
  };
}

function renderWithShell(registry: WidgetRegistry, initialLayout?: ShellLayout) {
  return create(
    <WidgetRegistryContext.Provider value={registry}>
      <ApplicationShell initialLayout={initialLayout} />
    </WidgetRegistryContext.Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ShellHeader", () => {
  it("renders shell-header", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    expect(renderer!.root.findByProps({ "data-testid": "shell-header" })).toBeDefined();
  });
});

describe("ShellSidebar", () => {
  it("side=left renders shell-sidebar-left", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "shell-sidebar-left" }),
    ).toBeDefined();
  });

  it("side=left is hidden when sidebar-left.visible=false", () => {
    const registry = new WidgetRegistry();
    const layout: ShellLayout = {
      regions: {
        ...createDefaultShellLayout().regions,
        "sidebar-left": { visible: false, items: [] },
      },
    };
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry, layout);
    });

    const el = renderer!.root.findByProps({ "data-testid": "shell-sidebar-left" });
    expect(el.props.style).toEqual({ display: "none" });
  });

  it("side=right renders shell-sidebar-right", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "shell-sidebar-right" }),
    ).toBeDefined();
  });

  it("side=right is hidden by default (visible=false)", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    const el = renderer!.root.findByProps({ "data-testid": "shell-sidebar-right" });
    expect(el.props.style).toEqual({ display: "none" });
  });
});

describe("ShellMain", () => {
  it("renders shell-main", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    expect(renderer!.root.findByProps({ "data-testid": "shell-main" })).toBeDefined();
  });

  it("shows shell-main-empty placeholder when no items", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    const main = renderer!.root.findByProps({ "data-testid": "shell-main" });
    expect(main.findByProps({ "data-testid": "shell-main-empty" })).toBeDefined();
  });

  it("renders items when present and no empty placeholder", () => {
    const registry = new WidgetRegistry();
    registry.register(makeWidget("MainWidget", "main"));
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    const main = renderer!.root.findByProps({ "data-testid": "shell-main" });
    expect(() => main.findByProps({ "data-testid": "shell-main-empty" })).toThrow();
    expect(main.children.length).toBe(1);
  });

  it("renders items in ascending order", () => {
    const registry = new WidgetRegistry();
    // WidgetB has lower order (renders first), WidgetA has higher order (renders second)
    const makeOrderedWidget = (name: string): WidgetDefinition => ({
      name,
      description: name,
      channelPattern: "data/*",
      consumes: ["text/plain"],
      priority: 10,
      parameters: {},
      factory: () => () =>
        React.createElement("span", { "data-testid": `widget-${name}` }),
    });
    registry.register(makeOrderedWidget("WidgetA"));
    registry.register(makeOrderedWidget("WidgetB"));
    const layout: ShellLayout = {
      regions: {
        ...createDefaultShellLayout().regions,
        main: {
          visible: true,
          items: [
            { id: "a", type: "WidgetA", props: {}, order: 2 },
            { id: "b", type: "WidgetB", props: {}, order: 1 },
          ],
        },
      },
    };
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry, layout);
    });

    // Use serialized output to check render order — WidgetB (order:1) must appear before WidgetA (order:2)
    const output = JSON.stringify(renderer!.toJSON());
    const idxB = output.indexOf("widget-WidgetB");
    const idxA = output.indexOf("widget-WidgetA");
    expect(idxB).toBeGreaterThan(-1);
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeLessThan(idxA);
  });
});

describe("ShellBottom", () => {
  it("renders shell-bottom", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    expect(renderer!.root.findByProps({ "data-testid": "shell-bottom" })).toBeDefined();
  });

  it("is hidden by default (visible=false)", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    const el = renderer!.root.findByProps({ "data-testid": "shell-bottom" });
    expect(el.props.style).toEqual({ display: "none" });
  });
});

describe("ShellStatusBar", () => {
  it("renders shell-status-bar", () => {
    const registry = new WidgetRegistry();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry);
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "shell-status-bar" }),
    ).toBeDefined();
  });
});

describe("RegionItemRenderer (via ShellMain)", () => {
  it("renders widget-not-found placeholder for unregistered type", () => {
    const registry = new WidgetRegistry();
    const layout: ShellLayout = {
      regions: {
        ...createDefaultShellLayout().regions,
        main: {
          visible: true,
          items: [{ id: "ghost", type: "GhostWidget", props: {}, order: 0 }],
        },
      },
    };
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry, layout);
    });

    const placeholder = renderer!.root.findByProps({
      "data-testid": "widget-not-found",
    });
    expect(placeholder).toBeDefined();
    expect(JSON.stringify(placeholder.children)).toContain("GhostWidget");
  });

  it("renders widget-loading placeholder for async (Promise) factory", () => {
    const registry = new WidgetRegistry();
    const asyncWidget: WidgetDefinition = {
      name: "AsyncWidget",
      description: "Async",
      channelPattern: "data/*",
      consumes: ["text/plain"],
      priority: 10,
      parameters: {},
      factory: () => Promise.resolve(() => null),
    };
    registry.register(asyncWidget);
    const layout: ShellLayout = {
      regions: {
        ...createDefaultShellLayout().regions,
        main: {
          visible: true,
          items: [{ id: "a1", type: "AsyncWidget", props: {}, order: 0 }],
        },
      },
    };
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = renderWithShell(registry, layout);
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "widget-loading" }),
    ).toBeDefined();
  });
});
