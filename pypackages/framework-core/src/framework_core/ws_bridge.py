from __future__ import annotations

from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .bus import BaseEvent, EventBus, EventHandler
from .control_stream import ControlStream
from .log_stream import LogStream
from .stream_types import StreamType


class _ClientPublishEvent(BaseEvent):
    """Wraps a raw JSON payload published by a frontend client over WebSocket.

    Backend consumers subscribed to the same channel will receive this type.
    The original payload is preserved in the ``payload`` field.
    """

    payload: Any


def _event_to_wire_message(channel: str, message: BaseEvent) -> dict[str, Any]:
    """Serialise ``message`` into the wire envelope format.

    Now includes ``stream="data"`` so clients can route by stream type.

    Returns a dict of the shape::

        {
            "stream": "data",
            "channel": "sensor/temperature",
            "headers": {"message_id": "...", "timestamp": 1712345678123},
            "payload": {"value": 22.5, "unit": "celsius"},
        }
    """
    payload = message.model_dump(exclude={"message_id", "timestamp"})
    return {
        "stream": StreamType.data,
        "channel": channel,
        "headers": {
            "message_id": message.message_id,
            "timestamp": message.timestamp,
        },
        "payload": payload,
    }


def _mount_ws_bridge(
    app: FastAPI,
    bus: EventBus,
    log_stream: LogStream,
    control_stream: ControlStream,
) -> None:
    """Mount a multiplexed ``/ws`` WebSocket endpoint that bridges to ``bus``.

    Each connected client maintains its own subscription map.  All channel
    traffic for a single browser tab is multiplexed over one connection.
    The connection is also registered with ``log_stream`` and
    ``control_stream`` so those streams can broadcast to it.

    Supported client actions (stream="data" or no stream field)
    -----------------------------------------------------------
    subscribe   – start receiving messages on *channel*; the last stored
                  message (if any) is sent immediately.
    unsubscribe – stop receiving messages on *channel*.
    publish     – forward a payload to all subscribers of *channel*,
                  including other connected WebSocket clients and any
                  backend consumers.

    Client messages with stream="log" or stream="control" are rejected;
    those streams are server-push-only.

    Args:
        app: FastAPI application instance.
        bus: Shared EventBus to subscribe/publish against.
        log_stream: LogStream instance to register connections with.
        control_stream: ControlStream instance to register connections with.

    Returns:
        None.
    """

    @app.websocket("/ws")
    async def websocket_bridge(websocket: WebSocket) -> None:
        await websocket.accept()
        log_stream._register(websocket)
        control_stream._register(websocket)

        # channel → handler mapping for this connection only
        subscriptions: dict[str, EventHandler] = {}

        def _make_handler() -> EventHandler:
            async def _handler(channel: str, message: BaseEvent) -> None:
                await websocket.send_json(_event_to_wire_message(channel, message))

            return _handler

        try:
            while True:
                data = await websocket.receive_json()
                if not isinstance(data, dict):
                    await websocket.send_json({"error": "Invalid message format"})
                    continue

                # Route by stream; default to "data" for backward compatibility
                # with clients that omit the stream field.
                stream = data.get("stream", StreamType.data)

                if stream == StreamType.log:
                    await websocket.send_json(
                        {"error": "Log stream is server-push only"}
                    )
                    continue

                if stream == StreamType.control:
                    await websocket.send_json(
                        {"error": "Control stream is server-push only"}
                    )
                    continue

                # stream == "data": route by action
                action = data.get("action")
                channel = data.get("channel")
                if not isinstance(action, str) or not isinstance(channel, str):
                    await websocket.send_json(
                        {"error": "Messages must include string action and channel"}
                    )
                    continue

                if action == "subscribe":
                    if channel in subscriptions:
                        continue
                    handler = _make_handler()
                    subscriptions[channel] = handler
                    # EventBus.subscribe schedules any last-message replay as an
                    # asyncio task, so the async handler is properly awaited.
                    bus.subscribe(channel, handler)
                    continue

                if action == "unsubscribe":
                    if channel in subscriptions:
                        handler = subscriptions.pop(channel)
                        bus.unsubscribe(channel, handler)
                    continue

                if action == "publish":
                    payload = data.get("payload")
                    # Wrap the raw payload in a typed event so the bus can
                    # attach standard headers (message_id, timestamp) and
                    # route it to all subscribers including backend consumers.
                    # Backend consumers will receive a _ClientPublishEvent with
                    # the original payload preserved in the ``payload`` field.
                    await bus.publish(channel, _ClientPublishEvent(payload=payload))
                    continue

                await websocket.send_json({"error": f"Unsupported action: {action}"})
        except WebSocketDisconnect:
            pass
        finally:
            log_stream._deregister(websocket)
            control_stream._deregister(websocket)
            for ch, handler in list(subscriptions.items()):
                bus.unsubscribe(ch, handler)
