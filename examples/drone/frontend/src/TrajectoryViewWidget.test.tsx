import { act } from "react";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { describe, expect, it } from "vitest";
import { EventBusProvider } from "@app-framework/core-ui";
import type { ComponentType } from "react";
import type { WebSocketLike } from "@app-framework/core-ui";

import { TRAJECTORY_VIEW } from "./TrajectoryViewWidget";

class FakeWebSocket implements WebSocketLike {
  public static readonly OPEN = 1;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public readyState = FakeWebSocket.OPEN;

  send(): void {}
  close(): void {}
  open(): void {
    this.onopen?.({} as Event);
  }
  deliver(channel: string, payload: Record<string, unknown>): void {
    this.onmessage?.({
      data: JSON.stringify({
        channel,
        headers: { message_id: "m", timestamp: Date.now() },
        payload,
      }),
    } as MessageEvent);
  }
}

const TrajectoryView = TRAJECTORY_VIEW.factory({ parameters: {} }) as ComponentType;

async function renderWidget() {
  const socket = new FakeWebSocket();
  await render(
    <EventBusProvider path="/ws" webSocketFactory={() => socket}>
      <TrajectoryView />
    </EventBusProvider>,
  );
  act(() => socket.open());
  return { socket };
}

describe("TrajectoryView widget", () => {
  it("is registered for the sidebar", () => {
    expect(TRAJECTORY_VIEW.name).toBe("TrajectoryView");
    expect(TRAJECTORY_VIEW.defaultRegion).toBe("sidebar-left");
  });

  it("exposes an accessible trajectory image", async () => {
    await renderWidget();
    await expect
      .element(page.getByRole("img", { name: /top-down flight trajectory/i }))
      .toBeInTheDocument();
  });

  it("updates the caption from telemetry samples", async () => {
    const { socket } = await renderWidget();

    act(() =>
      socket.deliver("drone/telemetry", {
        t: 0.1,
        segment: 0,
        position: [4.5, -1.0, 0.0],
        attitude: [0, 0, 0],
        velocity: [0, 0, 0],
        prop_w: [0, 0, 0, 0],
        target: [12, 0, 0],
      }),
    );

    await expect.element(page.getByText(/N 4\.5 m, E -1\.0 m/)).toBeInTheDocument();
    await expect.element(page.getByText(/1 samples/)).toBeInTheDocument();
  });
});
