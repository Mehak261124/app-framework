from __future__ import annotations

from fastapi import WebSocket


class LogStream:
    """Broadcasts free-text log entries to all connected WebSocket clients.

    Backend code calls :meth:`log` to push a ``stream="log"`` message to
    every currently-connected browser tab.  The WebSocket bridge registers
    and deregisters connections automatically.

    Example::

        await app.state.log_stream.log("Producer started")
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

    async def log(self, text: str) -> None:
        """Broadcast *text* to all connected clients as a ``stream="log"`` message.

        Silently skips any connection that raises during send (e.g. already closed).

        Args:
            text: Log entry to broadcast.

        Returns:
            None.
        """
        message = {"stream": "log", "payload": text}
        for ws in set(self._connections):
            try:
                await ws.send_json(message)
            except Exception:
                pass
