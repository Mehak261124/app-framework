import { useEffect, useState } from "react";

import { useEventBusClient } from "./EventBusContext";

/**
 * Subscribe to ``stream="log"`` messages pushed by the server.
 *
 * Returns the payload of the latest log message, or ``null`` before the
 * first message arrives.  The payload is typically a plain string but is
 * typed as ``unknown`` to match what the server sends.
 *
 * @returns Latest log payload from the server, or `null`.
 * @example
 * ```tsx
 * const log = useLogStream();
 * return <pre>{String(log ?? "")}</pre>;
 * ```
 */
export function useLogStream(): unknown {
  const client = useEventBusClient();
  const [latest, setLatest] = useState<unknown>(null);

  useEffect(() => {
    return client.onLog((payload) => {
      setLatest(payload);
    });
  }, [client]);

  return latest;
}
