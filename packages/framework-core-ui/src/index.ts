export {
  EventBusProvider,
  buildWebSocketUrl,
  useEventBusClient,
  type EventBusProviderProps,
} from "./EventBusContext";
export { useChannel, toPayloadWithHeaders } from "./useChannel";
export { usePublish } from "./usePublish";
export { useEventBusStatus } from "./useEventBusStatus";
export { useLogStream } from "./useLogStream";
export { useControlStream } from "./useControlStream";
export type {
  ConnectionStatus,
  EventHeaders,
  WireEvent,
  WebSocketFactory,
  StreamType,
  LogHandler,
  ControlHandler,
} from "./client";

/**
 * Base interface for all event payloads returned by {@link useChannel}.
 *
 * Consumer interfaces should extend this so that ``message_id`` and
 * ``timestamp`` are typed at the call site:
 *
 * ```ts
 * interface TemperatureReading extends BaseEvent {
 *   value: number;
 *   unit: string;
 * }
 * ```
 *
 * These fields are merged from the wire envelope's ``headers`` by
 * {@link toPayloadWithHeaders} inside {@link useChannel}.
 */
export interface BaseEvent {
  message_id: string;
  /** Milliseconds since Unix epoch. */
  timestamp: number;
}
