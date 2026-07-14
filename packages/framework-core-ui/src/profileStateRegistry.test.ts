import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyProfileState,
  registerProfileState,
  snapshotProfileState,
} from "./profileStateRegistry";

afterEach(() => {
  // The registry is a module singleton; ensure tests don't leak entries.
  applyProfileState(undefined);
});

describe("profileStateRegistry", () => {
  it("snapshots the current value of every registered key", () => {
    let a = 1;
    let b = "x";
    const offA = registerProfileState("a", {
      get: () => a,
      set: () => {},
      getDefault: () => 0,
    });
    const offB = registerProfileState("b", {
      get: () => b,
      set: () => {},
      getDefault: () => "",
    });

    a = 42;
    b = "y";
    expect(snapshotProfileState()).toEqual({ a: 42, b: "y" });

    offA();
    offB();
  });

  it("drops an entry when its unregister is called", () => {
    const off = registerProfileState("gone", {
      get: () => 1,
      set: () => {},
      getDefault: () => 0,
    });
    expect(snapshotProfileState()).toHaveProperty("gone");

    off();
    expect(snapshotProfileState()).not.toHaveProperty("gone");
  });

  it("applies saved values by calling each key's setter", () => {
    const setA = vi.fn();
    const setB = vi.fn();
    const offA = registerProfileState("a", {
      get: () => 0,
      set: setA,
      getDefault: () => -1,
    });
    const offB = registerProfileState("b", {
      get: () => "",
      set: setB,
      getDefault: () => "def",
    });

    applyProfileState({ a: 5, b: "hello" });

    expect(setA).toHaveBeenCalledWith(5);
    expect(setB).toHaveBeenCalledWith("hello");

    offA();
    offB();
  });

  it("resets a registered key to its default when the blob omits it", () => {
    const setA = vi.fn();
    const off = registerProfileState("a", {
      get: () => 0,
      set: setA,
      getDefault: () => 7,
    });

    applyProfileState({ a: 5 });
    expect(setA).toHaveBeenLastCalledWith(5); // saved value
    applyProfileState({}); // key absent → reset
    expect(setA).toHaveBeenLastCalledWith(7);
    applyProfileState(undefined); // no saved values → reset
    expect(setA).toHaveBeenLastCalledWith(7);

    off();
  });

  it("ignores keys with no registered widget", () => {
    const setA = vi.fn();
    const off = registerProfileState("a", {
      get: () => 0,
      set: setA,
      getDefault: () => -1,
    });

    applyProfileState({ a: 1, unknown: 99 });

    expect(setA).toHaveBeenCalledWith(1);
    off();
  });

  it("re-registering the same key replaces the entry", () => {
    const off1 = registerProfileState("k", {
      get: () => "first",
      set: () => {},
      getDefault: () => "",
    });
    const off2 = registerProfileState("k", {
      get: () => "second",
      set: () => {},
      getDefault: () => "",
    });

    expect(snapshotProfileState().k).toBe("second");

    // Unregistering the stale first handle must not remove the live entry.
    off1();
    expect(snapshotProfileState().k).toBe("second");

    off2();
    expect(snapshotProfileState()).not.toHaveProperty("k");
  });
});
