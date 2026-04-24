import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

import { useEventBusClient } from "./EventBusContext";
import type { WireEvent } from "./client";

interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
}

/**
 * Props for the {@link LogViewerComponent}.
 *
 * `channel` is the EventBus channel to subscribe to (e.g. `"log/app"`).
 * Parameter props correspond to the `parameters` schema declared in
 * {@link LOG_VIEWER}.
 */
export interface LogViewerProps {
  /** EventBus channel to subscribe to. Supports glob patterns e.g. `"log/*"`. */
  channel?: string;
  /**
   * Maximum number of log lines to retain.
   * When exceeded, the oldest lines are trimmed. Default: 1000.
   * Changes to this prop take effect on the next incoming log line —
   * they do not trigger a resubscribe or wipe existing log history.
   */
  maxLines?: number;
  /** Prepend an ISO 8601 timestamp to each line. Default: true. */
  showTimestamps?: boolean;
  /** Allow long lines to wrap. When false, lines are clipped. Default: false. */
  wrapLines?: boolean;
}

/**
 * Displays a live, auto-scrolling log stream from an EventBus channel.
 *
 * Subscribes to `channel` via {@link useEventBusClient} and accumulates
 * `text/plain` payloads into a scrollable list. Shows "No logs yet" until
 * the first event arrives. Trims oldest entries once `maxLines` is exceeded.
 *
 * **Subscription lifecycle:** the subscription is created on mount and torn
 * down on unmount. It is only re-created when `channel` or the client
 * instance changes — changing `maxLines`, `showTimestamps`, or `wrapLines`
 * does NOT resubscribe and does NOT reset the log history.
 *
 * Uses inline styles only — no external CSS dependencies.
 *
 * @param props Component props — see {@link LogViewerProps}.
 * @returns A scrolling log viewer element.
 * @example
 * ```tsx
 * <LogViewerComponent channel="log/app" maxLines={500} showTimestamps />
 * ```
 */
export const LogViewerComponent: ComponentType<LogViewerProps> = ({
  channel = "log/*",
  maxLines = 1000,
  showTimestamps = true,
  wrapLines = false,
}) => {
  const client = useEventBusClient();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * Ref that mirrors the `maxLines` prop so the subscription callback always
   * reads the latest value without `maxLines` being a dependency of the
   * subscription effect. This prevents resubscribing — and resetting log
   * history — when only `maxLines` changes.
   */
  const maxLinesRef = useRef(maxLines);
  useEffect(() => {
    maxLinesRef.current = maxLines;
  }, [maxLines]);

  /**
   * Subscribe to the channel on mount; unsubscribe on unmount or when
   * `channel` / `client` changes. Resets accumulated logs on each
   * (re)subscription so stale entries from a previous channel are not shown.
   */
  useEffect(() => {
    setLogs([]);
    return client.subscribe(channel, (event: WireEvent) => {
      const message =
        typeof event.payload === "string"
          ? event.payload
          : JSON.stringify(event.payload);
      const entry: LogEntry = {
        id: event.headers.message_id,
        timestamp: event.headers.timestamp,
        message,
      };
      setLogs((prev) => {
        const next = [...prev, entry];
        const limit = maxLinesRef.current;
        return next.length > limit ? next.slice(next.length - limit) : next;
      });
    });
  }, [channel, client]); // maxLines intentionally excluded — use maxLinesRef instead

  /** Scroll the log container to the bottom whenever a new line is appended. */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div
        style={{
          padding: "8px",
          color: "#888",
          fontFamily: "monospace",
          fontSize: "12px",
        }}
      >
        No logs yet
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "12px",
        overflowY: "auto",
        height: "100%",
        backgroundColor: "#1e1e1e",
        color: "#d4d4d4",
        padding: "8px",
        boxSizing: "border-box",
      }}
    >
      {logs.map((entry) => (
        <div
          key={entry.id}
          style={{
            whiteSpace: wrapLines ? "pre-wrap" : "pre",
            marginBottom: "2px",
          }}
        >
          {showTimestamps && (
            <span style={{ color: "#888", marginRight: "8px" }}>
              {new Date(entry.timestamp).toISOString()}
            </span>
          )}
          {entry.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
