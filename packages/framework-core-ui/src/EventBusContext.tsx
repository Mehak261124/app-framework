import { createContext, useContext, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { RealtimeEventBusClient, type WebSocketFactory } from "./client";

const EventBusContext = createContext<RealtimeEventBusClient | null>(null);

export interface EventBusProviderProps extends PropsWithChildren {
  path: string;
  reconnectDelayMs?: number;
  webSocketFactory?: WebSocketFactory;
}

interface LocationLike {
  protocol: string;
  host: string;
}

export function buildWebSocketUrl(path: string, locationLike: LocationLike): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const scheme = locationLike.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${locationLike.host}${normalizedPath}`;
}

export function EventBusProvider({
  path,
  reconnectDelayMs,
  webSocketFactory,
  children,
}: EventBusProviderProps): JSX.Element {
  const client = useMemo(() => {
    if (typeof window === "undefined") {
      throw new Error("EventBusProvider requires a browser environment.");
    }

    const url = buildWebSocketUrl(path, window.location);
    return new RealtimeEventBusClient(url, { reconnectDelayMs, webSocketFactory });
  }, [path, reconnectDelayMs, webSocketFactory]);

  useEffect(() => {
    client.start();
    return () => {
      client.stop();
    };
  }, [client]);

  return <EventBusContext.Provider value={client}>{children}</EventBusContext.Provider>;
}

export function useEventBusClient(): RealtimeEventBusClient {
  const client = useContext(EventBusContext);
  if (!client) {
    throw new Error("EventBus hooks must be used inside EventBusProvider.");
  }
  return client;
}
