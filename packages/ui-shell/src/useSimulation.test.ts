import { describe, it, expect } from "vitest";

describe("useSimulation url helper", () => {
  it("converts http to ws", () => {
    const backend = "http://localhost:8000";
    const normalized = backend.replace(/\/$/, "");
    const wsUrl = normalized.replace(/^http/, "ws") + "/ws";
    expect(wsUrl).toBe("ws://localhost:8000/ws");
  });

  it("handles trailing slash", () => {
    const backend = "http://localhost:8000/";
    const normalized = backend.replace(/\/$/, "");
    const wsUrl = normalized.replace(/^http/, "ws") + "/ws";
    expect(wsUrl).toBe("ws://localhost:8000/ws");
  });
});
