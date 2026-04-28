import React, { act } from "react";
import { render } from "vitest-browser-react";
import { describe, expect, it, vi } from "vitest";

import { EventBusProvider } from "./EventBusContext";
import { ParameterControllerComponent } from "./ParameterController";
import type { ParameterConfig } from "./ParameterController";
import type { WebSocketLike } from "./client";

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
  open(): void {
    this.onopen?.({} as Event);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SLIDER_PARAM: ParameterConfig = {
  title: "Time Step",
  type: "number",
  minimum: 0,
  maximum: 1,
  multipleOf: 0.01,
  default: 0.1,
  "x-options": { widget: "slider" },
};

const INPUT_PARAM: ParameterConfig = {
  title: "Max Iterations",
  type: "number",
  minimum: 1,
  maximum: 10000,
  multipleOf: 1,
  default: 500,
  "x-options": { widget: "input" },
};

const SELECT_PARAM: ParameterConfig = {
  title: "Solver",
  type: "string",
  enum: ["euler", "rk4", "adams"],
  default: "rk4",
  "x-options": { widget: "select" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderController(
  params?: Record<string, ParameterConfig>,
  channel = "params/control",
  debounceMs = 0,
) {
  const socket = new FakeWebSocket();
  const view = await render(
    <EventBusProvider path="/ws" webSocketFactory={() => socket}>
      <ParameterControllerComponent
        channel={channel}
        parameters={params}
        debounceMs={debounceMs}
      />
    </EventBusProvider>,
  );
  act(() => socket.open());
  return { view, socket };
}

function getPublishedPayloads(socket: FakeWebSocket): Record<string, unknown>[] {
  return socket.sent
    .map((raw) => JSON.parse(raw))
    .filter((msg) => msg.channel === "params/control")
    .map((msg) => msg.payload as Record<string, unknown>);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ParameterControllerComponent", () => {
  // ── Empty state ─────────────────────────────────────────────────────────────

  it("renders empty placeholder when parameters is undefined", async () => {
    const { view } = await renderController(undefined);
    expect(
      view.baseElement.querySelector('[data-testid="parameter-controller-empty"]'),
    ).not.toBeNull();
  });

  it("renders empty placeholder when parameters is {}", async () => {
    const { view } = await renderController({});
    expect(
      view.baseElement.querySelector('[data-testid="parameter-controller-empty"]'),
    ).not.toBeNull();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  it("renders slider for x-options widget: slider", async () => {
    const { view } = await renderController({ timestep: SLIDER_PARAM });
    expect(
      view.baseElement.querySelector('[data-testid="slider-timestep"]'),
    ).not.toBeNull();
  });

  it("renders number input for x-options widget: input", async () => {
    const { view } = await renderController({ max_iterations: INPUT_PARAM });
    expect(
      view.baseElement.querySelector('[data-testid="input-max_iterations"]'),
    ).not.toBeNull();
  });

  it("renders select for x-options widget: select", async () => {
    const { view } = await renderController({ solver: SELECT_PARAM });
    expect(
      view.baseElement.querySelector('[data-testid="select-solver"]'),
    ).not.toBeNull();
  });

  it("renders label for each parameter", async () => {
    const { view } = await renderController({ timestep: SLIDER_PARAM });
    expect(view.baseElement.textContent).toContain("Time Step");
  });

  // ── Default values ──────────────────────────────────────────────────────────

  it("initialises number input with default value", async () => {
    const { view } = await renderController({ max_iterations: INPUT_PARAM });
    const input = view.baseElement.querySelector<HTMLInputElement>(
      '[data-testid="input-max_iterations"]',
    );
    expect(input).not.toBeNull();
    expect(input!.value).toBe("500");
  });

  it("initialises select with default value", async () => {
    const { view } = await renderController({ solver: SELECT_PARAM });
    const trigger = view.baseElement.querySelector('[data-testid="select-solver"]');
    expect(trigger).not.toBeNull();
    expect(trigger!.textContent).toContain("rk4");
  });

  it("displays default value for slider", async () => {
    const { view } = await renderController({ timestep: SLIDER_PARAM });
    const valueDisplay = view.baseElement.querySelector(
      '[data-testid="slider-value-timestep"]',
    );
    expect(valueDisplay).not.toBeNull();
    expect(valueDisplay!.textContent).toContain("0.1");
  });

  // ── No publish on mount ──────────────────────────────────────────────────────

  it("does NOT publish on mount", async () => {
    const { socket } = await renderController({ timestep: SLIDER_PARAM });
    const payloads = getPublishedPayloads(socket);
    expect(payloads).toHaveLength(0);
  });

  // ── Publishing ──────────────────────────────────────────────────────────────

  it("publishes full state immediately on number input change", async () => {
    const { view, socket } = await renderController({
      max_iterations: INPUT_PARAM,
      solver: SELECT_PARAM,
    });

    const input = view.baseElement.querySelector<HTMLInputElement>(
      '[data-testid="input-max_iterations"]',
    )!;
    expect(input).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      nativeInputValueSetter.call(input, "200");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const payloads = getPublishedPayloads(socket);
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads[payloads.length - 1]).toMatchObject({ max_iterations: 200 });
  });

  it("published payload contains all current parameter values", async () => {
    const { view, socket } = await renderController({
      max_iterations: INPUT_PARAM,
      solver: SELECT_PARAM,
    });

    const input = view.baseElement.querySelector<HTMLInputElement>(
      '[data-testid="input-max_iterations"]',
    )!;
    expect(input).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      nativeInputValueSetter.call(input, "300");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const payloads = getPublishedPayloads(socket);
    const last = payloads[payloads.length - 1];
    expect(last).toHaveProperty("max_iterations");
    expect(last).toHaveProperty("solver");
  });

  // ── Debounce ────────────────────────────────────────────────────────────────

  it("debounces publish on slider change", async () => {
    vi.useFakeTimers();
    const { view, socket } = await renderController(
      { timestep: SLIDER_PARAM },
      "params/control",
      300,
    );

    const thumb = view.baseElement.querySelector<HTMLElement>(
      '[data-testid="slider-timestep"] [role="slider"]',
    );
    expect(thumb).not.toBeNull();

    await act(async () => {
      thumb!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      thumb!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      thumb!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    const beforeFlush = getPublishedPayloads(socket);
    expect(beforeFlush).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    const afterFlush = getPublishedPayloads(socket);
    expect(afterFlush).toHaveLength(1);

    vi.useRealTimers();
  });
});
