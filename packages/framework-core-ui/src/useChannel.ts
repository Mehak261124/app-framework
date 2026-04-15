import { useEffect, useState } from "react";
import { useEventBusClient } from "./EventBusContext";
import type { WireEvent } from "./client";

/**
 * Merge the wire envelope's ``headers`` fields into the payload object.
 *
 * For object payloads, returns ``{ ...payload, message_id, timestamp }``.
 * This is why consumer interfaces should extend ``BaseEvent`` — the merged
 * result always includes those two header fields.
 *
 * For non-object payloads (e.g. a bare number or string), the original value
 * is placed under a ``payload`` key alongside the headers.
 *
 * Header fields win over any same-named key in the payload (should never
 * occur in practice with well-typed producers).
 */
export function toPayloadWithHeaders<T>(event: WireEvent): T {
  const payload = event.payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return {
      ...payload,
      message_id: event.headers.message_id,
      timestamp: event.headers.timestamp,
    } as T;
  }

  return {
    message_id: event.headers.message_id,
    timestamp: event.headers.timestamp,
    payload,
  } as T;
}

/**
 * Subscribe to a channel and return the latest merged message as ``T``.
 *
 * ``T`` should extend ``BaseEvent`` so that ``message_id`` and ``timestamp``
 * are typed.  Returns ``null`` before the first message arrives.
 *
 * Supports fnmatch-style glob patterns (e.g. ``"sensor/*"``).
 *
 * @example
 * ```ts
 * interface TemperatureReading extends BaseEvent {
 *   value: number;
 *   unit: string;
 * }
 *
 * const data = useChannel<TemperatureReading>("sensor/temperature");
 * ```
 */
export function useChannel<T>(channel: string): T | null {
  const client = useEventBusClient();
  const [latest, setLatest] = useState<T | null>(null);

  useEffect(() => {
    return client.subscribe(channel, (event) => {
      setLatest(toPayloadWithHeaders<T>(event));
    });
  }, [channel, client]);

  return latest;
}
