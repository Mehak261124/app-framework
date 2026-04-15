from __future__ import annotations

import asyncio
from time import time_ns

from fastapi import WebSocket


class ControlStream:
    """Sends heartbeat and status signals to all connected WebSocket clients.

    Backend code calls :meth:`send_status` for ad-hoc control messages, and
    schedules :meth:`start_heartbeat` as a background task for periodic pings.
    The WebSocket bridge registers and deregisters connections automatically.

    Example::

        task = asyncio.create_task(app.state.control_stream.start_heartbeat())
    """

    def __init__(self) -> None:
        """Initialise with an empty connection registry."""
        self._connections: set[WebSocket] = set()

    def _register(self, ws: WebSocket) -> None:
        """Add *ws* to the broadcast set.

        Args:
            ws: Accepted WebSocket connection.

        Returns:
            None.
        """
        self._connections.add(ws)

    def _deregister(self, ws: WebSocket) -> None:
        """Remove *ws* from the broadcast set.

        Args:
            ws: WebSocket connection to remove.

        Returns:
            None. No-op if *ws* was not registered.
        """
        self._connections.discard(ws)

    async def send_status(self, data: dict[str, object]) -> None:
        """Broadcast *data* to all clients as a ``stream="control"`` status message.

        The payload is ``{"type": "status", **data}``.
        Silently skips connections that raise during send.

        Args:
            data: Arbitrary key/value pairs merged under ``type="status"``.

        Returns:
            None.
        """
        message = {"stream": "control", "payload": {"type": "status", **data}}
        for ws in set(self._connections):
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def start_heartbeat(self, interval_s: float = 5.0) -> None:
        """Send a ``stream="control"`` heartbeat to all clients at *interval_s* cadence.

        Runs until cancelled.  Designed to be wrapped in ``asyncio.create_task``.

        Args:
            interval_s: Seconds between heartbeats (default 5).

        Returns:
            None (runs forever until cancelled).
        """
        while True:
            ts = time_ns() // 1_000_000
            message = {
                "stream": "control",
                "payload": {"type": "heartbeat", "timestamp": ts},
            }
            for ws in set(self._connections):
                try:
                    await ws.send_json(message)
                except Exception:
                    pass
            await asyncio.sleep(interval_s)
