import { beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { createDefaultShellLayout } from "../shellTypes";
import type { LayoutProfile } from "../shellTypes";
import { selectActiveLayout, useShellLayoutStore } from "../stores/shellStore";
import { LayoutProfilesMenu } from "./LayoutProfilesMenu";

// ─── helpers ──────────────────────────────────────────────────────────────────

function profile(id: string, name: string): LayoutProfile {
  return { id, name, layout: createDefaultShellLayout() };
}

function seed(profiles: LayoutProfile[], activeProfileId: string) {
  const active = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  useShellLayoutStore.setState({
    profiles,
    activeProfileId,
    workingLayout: structuredClone(active.layout),
    defaultLayout: createDefaultShellLayout(),
  });
}

beforeEach(() => {
  localStorage.clear();
  seed([profile("p1", "Default")], "p1");
});

async function openMenu() {
  await page.getByRole("button", { name: /layout profile/i }).click();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LayoutProfilesMenu", () => {
  it("labels the trigger with the active profile's name", async () => {
    await render(<LayoutProfilesMenu />);

    await expect
      .element(page.getByRole("button", { name: /layout profile/i }))
      .toHaveTextContent("Default");
  });

  it("lists every profile as a menu item when opened", async () => {
    seed([profile("p1", "Monitoring"), profile("p2", "Tuning")], "p1");
    await render(<LayoutProfilesMenu />);

    await openMenu();

    await expect
      .element(page.getByRole("menuitemradio", { name: "Monitoring" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("menuitemradio", { name: "Tuning" }))
      .toBeInTheDocument();
  });

  it("marks the active profile item as checked", async () => {
    seed([profile("p1", "Monitoring"), profile("p2", "Tuning")], "p2");
    await render(<LayoutProfilesMenu />);

    await openMenu();

    await expect
      .element(page.getByRole("menuitemradio", { name: "Tuning" }))
      .toHaveAttribute("aria-checked", "true");
  });

  it("switches the active profile when a menu item is selected", async () => {
    seed([profile("p1", "Monitoring"), profile("p2", "Tuning")], "p1");
    await render(<LayoutProfilesMenu />);

    await openMenu();
    await page.getByRole("menuitemradio", { name: "Tuning" }).click();

    expect(useShellLayoutStore.getState().activeProfileId).toBe("p2");
    await expect
      .element(page.getByRole("button", { name: /layout profile/i }))
      .toHaveTextContent("Tuning");
  });

  it("creates and activates a new profile via Save as new profile", async () => {
    await render(<LayoutProfilesMenu />);

    await openMenu();
    await page.getByRole("menuitem", { name: /save as new profile/i }).click();
    await page.getByRole("textbox", { name: /profile name/i }).fill("Monitoring");
    await page.getByRole("button", { name: /create profile/i }).click();

    const state = useShellLayoutStore.getState();
    expect(state.profiles.map((p) => p.name)).toContain("Monitoring");
    const active = state.profiles.find((p) => p.id === state.activeProfileId)!;
    expect(active.name).toBe("Monitoring");
  });

  it("renames the active profile", async () => {
    await render(<LayoutProfilesMenu />);

    await openMenu();
    await page.getByRole("menuitem", { name: /^rename/i }).click();
    const input = page.getByRole("textbox", { name: /profile name/i });
    await input.fill("Renamed");
    await page.getByRole("button", { name: /save name/i }).click();

    expect(useShellLayoutStore.getState().profiles[0].name).toBe("Renamed");
  });

  it("deletes the active profile when more than one exists", async () => {
    seed([profile("p1", "Monitoring"), profile("p2", "Tuning")], "p2");
    await render(<LayoutProfilesMenu />);

    await openMenu();
    await page.getByRole("menuitem", { name: /^delete/i }).click();

    const ids = useShellLayoutStore.getState().profiles.map((p) => p.id);
    expect(ids).toEqual(["p1"]);
  });

  it("disables Delete when only one profile exists", async () => {
    await render(<LayoutProfilesMenu />);

    await openMenu();

    await expect
      .element(page.getByRole("menuitem", { name: /^delete/i }))
      .toBeDisabled();
  });

  it("resets the working layout to default via Reset to default", async () => {
    // Arrange the working layout away from the default first.
    useShellLayoutStore.getState().setLayout((prev) => ({
      ...prev,
      regions: { ...prev.regions, bottom: { visible: true, items: [] } },
    }));
    await render(<LayoutProfilesMenu />);

    await openMenu();
    await page.getByRole("menuitem", { name: /reset to default/i }).click();

    expect(
      selectActiveLayout(useShellLayoutStore.getState()).regions.bottom.visible,
    ).toBe(false);
  });
});
