import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventBusProvider } from "./EventBusContext";
import { RealtimeEventBusClient, type WebSocketLike } from "./client";
import { useChannel } from "./useChannel";
import { useControlStream } from "./useControlStream";
import { useLogStream } from "./useLogStream";

class FakeWebSocket implements WebSocketLike {
  public static readonly OPEN = 1;

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public readyState = FakeWebSocket.OPEN;
  public readonly sent: string[] = [];

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.onclose?.({} as CloseEvent);
  }

  public open(): void {
    this.onopen?.({} as Event);
  }

  public receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe("stream hooks", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:5173" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useLogStream returns latest log payload", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const log = useLogStream();
      useEffect(() => {
        seen.push(log);
      }, [log]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(JSON.stringify({ stream: "log", payload: "app started" }));
    });

    expect(seen.at(-1)).toBe("app started");
  });

  it("useLogStream updates on each new log message", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const log = useLogStream();
      useEffect(() => {
        if (log !== null) seen.push(log);
      }, [log]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(JSON.stringify({ stream: "log", payload: "first" }));
    });
    act(() => {
      socket.receive(JSON.stringify({ stream: "log", payload: "second" }));
    });

    expect(seen).toEqual(["first", "second"]);
  });

  it("useControlStream returns latest control payload", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const ctrl = useControlStream();
      useEffect(() => {
        seen.push(ctrl);
      }, [ctrl]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(
        JSON.stringify({
          stream: "control",
          payload: { type: "heartbeat", timestamp: 123 },
        }),
      );
    });

    expect(seen.at(-1)).toEqual({ type: "heartbeat", timestamp: 123 });
  });

  it("useChannel ignores log and control stream messages", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const data = useChannel<Record<string, unknown>>("sensor/temperature");
      useEffect(() => {
        if (data !== null) seen.push(data);
      }, [data]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(JSON.stringify({ stream: "log", payload: "some log text" }));
      socket.receive(
        JSON.stringify({ stream: "control", payload: { type: "heartbeat" } }),
      );
    });

    // No data messages — seen should still be empty.
    expect(seen).toHaveLength(0);

    act(() => {
      socket.receive(
        JSON.stringify({
          stream: "data",
          channel: "sensor/temperature",
          headers: { message_id: "m1", timestamp: 123 },
          payload: { value: 22.5 },
        }),
      );
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ value: 22.5 });
  });

  it("onData is an alias for subscribe and receives stream=data messages", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    const client = new RealtimeEventBusClient("ws://localhost/ws", {
      webSocketFactory: () => socket,
    });
    client.start();
    const off = client.onData("sensor/*", (event) => seen.push(event.payload));

    socket.open();
    socket.receive(
      JSON.stringify({
        stream: "data",
        channel: "sensor/temperature",
        headers: { message_id: "m1", timestamp: 123 },
        payload: { value: 22.5 },
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ value: 22.5 });

    off();
    client.stop();
  });

  it("throws when useLogStream is used outside EventBusProvider", () => {
    function Probe(): JSX.Element | null {
      useLogStream();
      return null;
    }
    expect(() => {
      act(() => {
        create(<Probe />);
      });
    }).toThrow("EventBus hooks must be used inside EventBusProvider.");
  });

  it("throws when useControlStream is used outside EventBusProvider", () => {
    function Probe(): JSX.Element | null {
      useControlStream();
      return null;
    }
    expect(() => {
      act(() => {
        create(<Probe />);
      });
    }).toThrow("EventBus hooks must be used inside EventBusProvider.");
  });
});
