import { useCallback } from "react";
import { useEventBusClient } from "./EventBusContext";

export function usePublish(): (channel: string, payload: unknown) => void {
  const client = useEventBusClient();

  return useCallback(
    (channel: string, payload: unknown) => {
      client.publish(channel, payload);
    },
    [client],
  );
}
