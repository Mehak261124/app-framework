import { useState } from "react";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultShellLayout } from "./shellTypes";
import { applyProfileState, snapshotProfileState } from "./profileStateRegistry";
import { useShellLayoutStore } from "./stores/shellStore";
import { useProfileState } from "./useProfileState";

afterEach(() => {
  applyProfileState(undefined); // no-op; kept for symmetry
  localStorage.clear();
});

/** Seed the store with a single active profile carrying `state`. */
function seedActiveProfile(state?: Record<string, unknown>) {
  const layout = createDefaultShellLayout();
  useShellLayoutStore.setState({
    profiles: [{ id: "p1", name: "Default", layout, state }],
    activeProfileId: "p1",
    workingLayout: layout,
    defaultLayout: layout,
  });
}

function Volume({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  useProfileState("volume", value, setValue);
  return <span data-testid="v">{value}</span>;
}

describe("useProfileState", () => {
  it("registers its value so snapshotProfileState captures it", async () => {
    seedActiveProfile();
    await render(<Volume initial={7} />);

    expect(snapshotProfileState()).toMatchObject({ volume: 7 });
  });

  it("applies the active profile's saved value on mount", async () => {
    seedActiveProfile({ volume: 42 });
    await render(<Volume initial={7} />);

    await expect.element(page.getByTestId("v")).toHaveTextContent("42");
  });

  it("does not override the widget when the profile has no saved value", async () => {
    seedActiveProfile({}); // no "volume" key
    await render(<Volume initial={7} />);

    await expect.element(page.getByTestId("v")).toHaveTextContent("7");
  });

  it("unregisters on unmount so its key leaves the snapshot", async () => {
    seedActiveProfile();
    const screen = await render(<Volume initial={7} />);
    expect(snapshotProfileState()).toHaveProperty("volume");

    screen.unmount();
    expect(snapshotProfileState()).not.toHaveProperty("volume");
  });
});
