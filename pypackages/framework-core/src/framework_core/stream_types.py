from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel


class StreamType(StrEnum):
    """Named stream discriminators carried on every WebSocket wire message.

    Args:
        data: EventBus channel data (subscribe/publish flow).
        log: Free-text log entries broadcast by the server.
        control: Heartbeat and status signals from the server.
    """

    data = "data"
    log = "log"
    control = "control"


class WireMessage(BaseModel):
    """Outgoing WebSocket envelope with a stream discriminator.

    Args:
        stream: Which stream this message belongs to.
        channel: Concrete EventBus channel (data stream only).
        payload: Message body — structure depends on stream type.

    Returns:
        Serialisable envelope for ``websocket.send_json``.
    """

    stream: StreamType
    channel: str | None = None
    payload: Any = None
