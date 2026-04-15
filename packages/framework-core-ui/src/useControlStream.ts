import { useEffect, useState } from "react";

import { useEventBusClient } from "./EventBusContext";

/**
 * Subscribe to ``stream="control"`` messages pushed by the server.
 *
 * Returns the payload of the latest control message, or ``null`` before the
 * first message arrives.  Control payloads typically look like
 * ``{ type: "heartbeat", timestamp: number }`` or ``{ type: "status", … }``.
 *
 * @returns Latest control payload from the server, or `null`.
 * @example
 * ```tsx
 * const ctrl = useControlStream();
 * // ctrl?.type === "heartbeat" means the server is alive
 * ```
 */
export function useControlStream(): unknown {
  const client = useEventBusClient();
  const [latest, setLatest] = useState<unknown>(null);

  useEffect(() => {
    return client.onControl((payload) => {
      setLatest(payload);
    });
  }, [client]);

  return latest;
}
