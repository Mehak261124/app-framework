import { describe, expect, it } from "vitest";

import { createDefaultShellLayout, type RegionId } from "./shellTypes";
import { WidgetRegistry } from "./widgetRegistry";

describe("createDefaultShellLayout", () => {
  it("returns all six RegionId keys", () => {
    const layout = createDefaultShellLayout();
    const expectedKeys: RegionId[] = [
      "header",
      "sidebar-left",
      "main",
      "sidebar-right",
      "bottom",
      "status-bar",
    ];
    expect(Object.keys(layout.regions).sort()).toEqual(expectedKeys.sort());
  });

  it("header, sidebar-left, main, status-bar have visible: true", () => {
    const layout = createDefaultShellLayout();
    expect(layout.regions.header.visible).toBe(true);
    expect(layout.regions["sidebar-left"].visible).toBe(true);
    expect(layout.regions.main.visible).toBe(true);
    expect(layout.regions["status-bar"].visible).toBe(true);
  });

  it("sidebar-right and bottom have visible: false", () => {
    const layout = createDefaultShellLayout();
    expect(layout.regions["sidebar-right"].visible).toBe(false);
    expect(layout.regions.bottom.visible).toBe(false);
  });

  it("all regions start with items: []", () => {
    const layout = createDefaultShellLayout();
    for (const region of Object.values(layout.regions)) {
      expect(region.items).toEqual([]);
    }
  });
});

describe("WidgetDefinition with defaultRegion", () => {
  it("roundtrips defaultRegion through register/get", () => {
    const registry = new WidgetRegistry();
    const definition = {
      name: "TestWidget",
      description: "A test widget",
      defaultRegion: "sidebar-left" as RegionId,
      channelPattern: "test/*",
      consumes: ["text/plain"],
      priority: 0,
      parameters: {},
      factory: () => () => null,
    };

    registry.register(definition);
    const retrieved = registry.get("TestWidget");

    expect(retrieved).toBeDefined();
    expect(retrieved?.defaultRegion).toBe("sidebar-left");
  });
});
