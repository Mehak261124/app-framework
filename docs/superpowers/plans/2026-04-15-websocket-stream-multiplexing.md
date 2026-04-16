# WebSocket Stream Multiplexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the single `/ws` WebSocket connection to carry three named stream types (`data`, `log`, `control`) using a `stream` discriminator field, without breaking any existing tests.

**Architecture:** Every server→client WebSocket message gains a `stream` field. The existing EventBus data flow becomes `stream="data"`. Two new push-only channels (`log`, `control`) are added via dedicated `LogStream` and `ControlStream` classes that broadcast directly to connected sockets. The TypeScript client routes incoming messages by `stream` and exposes `onData`/`onLog`/`onControl` subscription methods; hooks `useLogStream` and `useControlStream` wrap them.

**Tech Stack:** Python — FastAPI, Pydantic v2, anyio/pytest; TypeScript — React, Vitest, react-test-renderer.

---

## Wire Format Reference

**Server → Client:**

```json
{ "stream": "data",    "channel": "sensor/temp", "headers": {"message_id":"…","timestamp":123}, "payload": {…} }
{ "stream": "log",     "payload": "text message" }
{ "stream": "control", "payload": { "type": "heartbeat", "timestamp": 123 } }
```

**Client → Server (unchanged — backward compat):**

```json
{ "action": "subscribe",   "channel": "sensor/temp" }
{ "action": "unsubscribe", "channel": "sensor/temp" }
{ "action": "publish",     "channel": "sensor/temp", "payload": {…} }
```

Incoming messages with an explicit `stream` field other than `"data"` return an error (log/control are server→client only).

---

## File Map

**Create (Python):**

- `pypackages/framework-core/src/framework_core/stream_types.py` — `StreamType` enum + `WireMessage` Pydantic model
- `pypackages/framework-core/src/framework_core/log_stream.py` — `LogStream` class
- `pypackages/framework-core/src/framework_core/control_stream.py` — `ControlStream` class
- `pypackages/framework-core/tests/test_stream_types.py`
- `pypackages/framework-core/tests/test_log_stream.py`
- `pypackages/framework-core/tests/test_control_stream.py`
- `pypackages/framework-core/tests/test_streams_integration.py`

**Modify (Python):**

- `pypackages/framework-core/src/framework_core/ws_bridge.py` — add stream routing + connection registry
- `pypackages/framework-core/src/framework_core/__init__.py` — create/expose LogStream + ControlStream
- `examples/backend/main.py` — demo all 3 streams

**Create (TypeScript):**

- `packages/framework-core-ui/src/useLogStream.ts`
- `packages/framework-core-ui/src/useControlStream.ts`
- `packages/framework-core-ui/src/stream_hooks.test.tsx`

**Modify (TypeScript):**

- `packages/framework-core-ui/src/client.ts` — add stream routing, `onData`/`onLog`/`onControl`
- `packages/framework-core-ui/src/index.ts` — export new hooks and types

**Modify (Docs):**

- `CLAUDE.md` — add wire format and stream types section

---

## Task 1: Python — `stream_types.py`

**Files:**

- Create: `pypackages/framework-core/src/framework_core/stream_types.py`
- Test: `pypackages/framework-core/tests/test_stream_types.py`

- [ ] **Step 1: Write the failing test**

```python
# pypackages/framework-core/tests/test_stream_types.py
from __future__ import annotations

from framework_core.stream_types import StreamType, WireMessage


def test_stream_type_string_values() -> None:
    assert StreamType.data == "data"
    assert StreamType.log == "log"
    assert StreamType.control == "control"


def test_wire_message_data_serialises() -> None:
    msg = WireMessage(
        stream=StreamType.data,
        channel="sensor/temperature",
        payload={"value": 22.5},
    )
    d = msg.model_dump()
    assert d["stream"] == "data"
    assert d["channel"] == "sensor/temperature"
    assert d["payload"] == {"value": 22.5}


def test_wire_message_log_has_no_channel() -> None:
    msg = WireMessage(stream=StreamType.log, payload="app started")
    assert msg.channel is None
    d = msg.model_dump()
    assert d["stream"] == "log"
    assert d["payload"] == "app started"


def test_wire_message_control_serialises() -> None:
    msg = WireMessage(
        stream=StreamType.control,
        payload={"type": "heartbeat", "timestamp": 123},
    )
    d = msg.model_dump()
    assert d["stream"] == "control"
    assert d["payload"]["type"] == "heartbeat"
```

- [ ] **Step 2: Run test to verify it fails**

```
uv run pytest pypackages/framework-core/tests/test_stream_types.py -v
```

Expected: `ModuleNotFoundError: No module named 'framework_core.stream_types'`

- [ ] **Step 3: Implement `stream_types.py`**

```python
# pypackages/framework-core/src/framework_core/stream_types.py
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class StreamType(str, Enum):
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
```

- [ ] **Step 4: Run test to verify it passes**

```
uv run pytest pypackages/framework-core/tests/test_stream_types.py -v
```

Expected: `4 passed`

---

## Task 2: Python — `log_stream.py`

**Files:**

- Create: `pypackages/framework-core/src/framework_core/log_stream.py`
- Test: `pypackages/framework-core/tests/test_log_stream.py`

- [ ] **Step 1: Write the failing tests**

```python
# pypackages/framework-core/tests/test_log_stream.py
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from framework_core.log_stream import LogStream


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_log_broadcasts_to_all_registered_connections() -> None:
    stream = LogStream()
    ws1: MagicMock = MagicMock()
    ws1.send_json = AsyncMock()
    ws2: MagicMock = MagicMock()
    ws2.send_json = AsyncMock()

    stream._register(ws1)
    stream._register(ws2)
    await stream.log("hello world")

    ws1.send_json.assert_called_once_with({"stream": "log", "payload": "hello world"})
    ws2.send_json.assert_called_once_with({"stream": "log", "payload": "hello world"})


@pytest.mark.anyio
async def test_log_does_not_send_after_deregister() -> None:
    stream = LogStream()
    ws: MagicMock = MagicMock()
    ws.send_json = AsyncMock()

    stream._register(ws)
    stream._deregister(ws)
    await stream.log("should not arrive")

    ws.send_json.assert_not_called()


@pytest.mark.anyio
async def test_log_tolerates_send_errors_from_closed_connection() -> None:
    stream = LogStream()
    ws: MagicMock = MagicMock()
    ws.send_json = AsyncMock(side_effect=Exception("connection closed"))

    stream._register(ws)
    # Must not raise even when send fails.
    await stream.log("error resilience test")


@pytest.mark.anyio
async def test_log_with_no_connections_is_a_no_op() -> None:
    stream = LogStream()
    # No registrations — must not raise.
    await stream.log("silent log")
```

- [ ] **Step 2: Run to verify failure**

```
uv run pytest pypackages/framework-core/tests/test_log_stream.py -v
```

Expected: `ModuleNotFoundError: No module named 'framework_core.log_stream'`

- [ ] **Step 3: Implement `log_stream.py`**

```python
# pypackages/framework-core/src/framework_core/log_stream.py
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
```

- [ ] **Step 4: Run to verify tests pass**

```
uv run pytest pypackages/framework-core/tests/test_log_stream.py -v
```

Expected: `4 passed`

---

## Task 3: Python — `control_stream.py`

**Files:**

- Create: `pypackages/framework-core/src/framework_core/control_stream.py`
- Test: `pypackages/framework-core/tests/test_control_stream.py`

- [ ] **Step 1: Write the failing tests**

```python
# pypackages/framework-core/tests/test_control_stream.py
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from framework_core.control_stream import ControlStream


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_send_status_broadcasts_to_all_connections() -> None:
    stream = ControlStream()
    ws1: MagicMock = MagicMock()
    ws1.send_json = AsyncMock()
    ws2: MagicMock = MagicMock()
    ws2.send_json = AsyncMock()

    stream._register(ws1)
    stream._register(ws2)
    await stream.send_status({"key": "value"})

    expected = {"stream": "control", "payload": {"type": "status", "key": "value"}}
    ws1.send_json.assert_called_once_with(expected)
    ws2.send_json.assert_called_once_with(expected)


@pytest.mark.anyio
async def test_send_status_does_not_send_after_deregister() -> None:
    stream = ControlStream()
    ws: MagicMock = MagicMock()
    ws.send_json = AsyncMock()

    stream._register(ws)
    stream._deregister(ws)
    await stream.send_status({"key": "value"})

    ws.send_json.assert_not_called()


@pytest.mark.anyio
async def test_send_status_tolerates_send_errors() -> None:
    stream = ControlStream()
    ws: MagicMock = MagicMock()
    ws.send_json = AsyncMock(side_effect=Exception("closed"))

    stream._register(ws)
    await stream.send_status({"key": "value"})  # must not raise


@pytest.mark.anyio
async def test_heartbeat_sends_control_message_with_timestamp() -> None:
    import asyncio

    stream = ControlStream()
    ws: MagicMock = MagicMock()
    ws.send_json = AsyncMock()
    stream._register(ws)

    # Run one heartbeat tick then cancel.
    task = asyncio.create_task(stream.start_heartbeat(interval_s=0.01))
    await asyncio.sleep(0.05)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert ws.send_json.call_count >= 1
    call_args = ws.send_json.call_args_list[0][0][0]
    assert call_args["stream"] == "control"
    assert call_args["payload"]["type"] == "heartbeat"
    assert isinstance(call_args["payload"]["timestamp"], int)
```

- [ ] **Step 2: Run to verify failure**

```
uv run pytest pypackages/framework-core/tests/test_control_stream.py -v
```

Expected: `ModuleNotFoundError: No module named 'framework_core.control_stream'`

- [ ] **Step 3: Implement `control_stream.py`**

```python
# pypackages/framework-core/src/framework_core/control_stream.py
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
```

- [ ] **Step 4: Run to verify tests pass**

```
uv run pytest pypackages/framework-core/tests/test_control_stream.py -v
```

Expected: `4 passed`

---

## Task 4: Python — Update `ws_bridge.py`

**Files:**

- Modify: `pypackages/framework-core/src/framework_core/ws_bridge.py`

Three changes:

1. `_event_to_wire_message` adds `"stream": "data"` to outgoing data envelopes.
2. `_mount_ws_bridge` accepts `log_stream` and `control_stream` and registers/deregisters them per connection.
3. Incoming messages with `stream != "data"` return an error (log/control are server-push-only).

- [ ] **Step 1: Replace `ws_bridge.py` with the updated version**

```python
# pypackages/framework-core/src/framework_core/ws_bridge.py
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

    @app.websocket("/ws")  # type: ignore[misc]
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
```

- [ ] **Step 2: Verify existing tests still pass**

```
uv run pytest pypackages/framework-core/tests/ -v
```

Expected: all previously passing tests still pass (existing ws_bridge tests will pass because backward-compat default keeps `stream` optional on incoming messages).

**Note:** The existing ws_bridge tests send messages without a `stream` field — they default to `"data"`, so subscribe/publish/unsubscribe still work. Assertions on `received["channel"]` and `received["payload"]` still pass; tests that don't check `received["stream"]` are unaffected.

---

## Task 5: Python — Update `__init__.py`

**Files:**

- Modify: `pypackages/framework-core/src/framework_core/__init__.py`

- [ ] **Step 1: Replace `__init__.py` with the updated version**

```python
# pypackages/framework-core/src/framework_core/__init__.py
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from .bus import EventBus
from .control_stream import ControlStream
from .log_stream import LogStream
from .ws_bridge import _mount_ws_bridge


def create_app(lifespan: Any = None) -> FastAPI:
    """Create and return a configured FastAPI application.

    Mounts the ``/ws`` WebSocket endpoint backed by a shared ``EventBus``,
    ``LogStream``, and ``ControlStream``.  All three are accessible via
    ``app.state``:

    - ``app.state.bus`` — in-process pub/sub broker.
    - ``app.state.log_stream`` — broadcast free-text log entries.
    - ``app.state.control_stream`` — broadcast heartbeat/status signals.

    Args:
        lifespan: Optional async context manager for startup/shutdown hooks.
                  It receives the ``FastAPI`` app instance and must be an
                  ``@asynccontextmanager`` that yields once.  The framework
                  sets all three state attributes *before* entering the custom
                  lifespan, so they are always available when your hooks run.

    Returns:
        Configured ``FastAPI`` application with a shared ``EventBus``,
        ``LogStream``, ``ControlStream``, and websocket bridge at ``/ws``.

    Example::

        @asynccontextmanager
        async def lifespan(app: FastAPI):
            await app.state.log_stream.log("Server starting")
            tasks = [asyncio.create_task(start_producer(app.state.bus))]
            yield
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

        app = create_app(lifespan=lifespan)
    """
    bus = EventBus()
    log_stream = LogStream()
    control_stream = ControlStream()

    @asynccontextmanager
    async def _framework_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        app.state.bus = bus
        app.state.log_stream = log_stream
        app.state.control_stream = control_stream
        if lifespan is not None:
            async with lifespan(app):
                yield
        else:
            yield

    app = FastAPI(lifespan=_framework_lifespan)

    @app.get("/health")  # type: ignore[misc]
    async def health() -> dict[str, str]:
        """Return a lightweight process-health response for checks/tests.

        Returns:
            Mapping containing ``{\"status\": \"ok\"}``.
        """
        return {"status": "ok"}

    _mount_ws_bridge(app, bus, log_stream, control_stream)
    return app
```

- [ ] **Step 2: Verify all existing Python tests still pass**

```
uv run pytest pypackages/framework-core/tests/ -v
```

Expected: all previously passing tests still pass.

---

## Task 6: Python — Integration tests for all three streams

**Files:**

- Create: `pypackages/framework-core/tests/test_streams_integration.py`

- [ ] **Step 1: Write the integration tests**

```python
# pypackages/framework-core/tests/test_streams_integration.py
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from framework_core import create_app


def test_data_messages_include_stream_field() -> None:
    """Outgoing EventBus messages now carry stream="data"."""
    app = create_app()

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as subscriber:
            subscriber.send_json(
                {"action": "subscribe", "channel": "sensor/temperature"}
            )
            with client.websocket_connect("/ws") as publisher:
                publisher.send_json(
                    {
                        "action": "publish",
                        "channel": "sensor/temperature",
                        "payload": {"value": 22.5},
                    }
                )
            received = subscriber.receive_json()

    assert received["stream"] == "data"
    assert received["channel"] == "sensor/temperature"


def test_backward_compat_subscribe_without_stream_field() -> None:
    """Clients that omit stream still receive data messages correctly."""
    app = create_app()

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as subscriber:
            # No stream field — existing wire format.
            subscriber.send_json(
                {"action": "subscribe", "channel": "sensor/temperature"}
            )
            with client.websocket_connect("/ws") as publisher:
                publisher.send_json(
                    {
                        "action": "publish",
                        "channel": "sensor/temperature",
                        "payload": {"value": 37.0},
                    }
                )
            received = subscriber.receive_json()

    assert received["channel"] == "sensor/temperature"
    assert received["stream"] == "data"  # always set on outgoing messages


def test_client_sending_log_stream_returns_error() -> None:
    """Clients cannot push to the log stream (server-push only)."""
    app = create_app()

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"stream": "log", "action": "write", "channel": "x"})
            reply = ws.receive_json()

    assert "error" in reply
    assert "server-push only" in reply["error"].lower()


def test_client_sending_control_stream_returns_error() -> None:
    """Clients cannot push to the control stream (server-push only)."""
    app = create_app()

    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.send_json({"stream": "control", "action": "cmd", "channel": "x"})
            reply = ws.receive_json()

    assert "error" in reply
    assert "server-push only" in reply["error"].lower()


def test_create_app_exposes_log_stream_and_control_stream() -> None:
    """create_app() exposes log_stream and control_stream on app.state."""
    from framework_core.control_stream import ControlStream
    from framework_core.log_stream import LogStream

    marker: dict[str, bool] = {"ok": False}

    @asynccontextmanager
    async def check_lifespan(app: FastAPI):  # type: ignore[misc]
        marker["ok"] = (
            isinstance(app.state.log_stream, LogStream)
            and isinstance(app.state.control_stream, ControlStream)
        )
        yield

    app = create_app(lifespan=check_lifespan)
    with TestClient(app):
        pass

    assert marker["ok"]
```

- [ ] **Step 2: Run the integration tests**

```
uv run pytest pypackages/framework-core/tests/test_streams_integration.py -v
```

Expected: `5 passed`

- [ ] **Step 3: Run the full Python test suite**

```
uv run pytest pypackages/framework-core/tests/ -v
```

Expected: all tests pass (15 pre-existing + new ones).

---

## Task 7: Python — Update `examples/backend/main.py`

**Files:**

- Modify: `examples/backend/main.py`

- [ ] **Step 1: Update `main.py` to demonstrate all 3 streams**

```python
# examples/backend/main.py
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from framework_core import create_app

from .consumers import register_consumers
from .producers import start_log_producer, start_sine_wave_producer


async def _start_log_stream_demo(app: FastAPI) -> None:
    """Periodically emit free-text entries to the log stream."""
    count = 0
    while True:
        count += 1
        await app.state.log_stream.log(f"Demo tick #{count}: producers running")
        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Register demo services and manage producer task lifecycle.

    Demonstrates all three WebSocket stream types:
    - data stream: sine-wave and log-entry EventBus producers.
    - log stream: periodic free-text log entries via LogStream.
    - control stream: heartbeat every 10 seconds via ControlStream.
    """
    register_consumers(app.state.bus)
    tasks = [
        asyncio.create_task(start_sine_wave_producer(app.state.bus)),
        asyncio.create_task(start_log_producer(app.state.bus)),
        asyncio.create_task(_start_log_stream_demo(app)),
        asyncio.create_task(app.state.control_stream.start_heartbeat(interval_s=10.0)),
    ]
    await app.state.log_stream.log("Backend started — all three streams active.")
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


app = create_app(lifespan=lifespan)
```

- [ ] **Step 2: Verify Python tests still pass after example update**

```
uv run pytest pypackages/framework-core/tests/ -q
```

Expected: all tests pass.

---

## Task 8: TypeScript — Update `client.ts`

**Files:**

- Modify: `packages/framework-core-ui/src/client.ts`

Three changes:

1. Add `StreamType`, `LogHandler`, `ControlHandler` exports.
2. Add private `logHandlers` and `controlHandlers` sets to `RealtimeEventBusClient`.
3. Refactor `onmessage` to route by `stream` field; add `onData`, `onLog`, `onControl` methods.

- [ ] **Step 1: Add new types at the top of `client.ts` (after existing type exports)**

Insert after line 16 (`export type ChannelHandler = ...`):

```ts
export type StreamType = "data" | "log" | "control";
export type LogHandler = (payload: unknown) => void;
export type ControlHandler = (payload: unknown) => void;
```

- [ ] **Step 2: Add private fields to `RealtimeEventBusClient`**

After the `private readonly lastByChannel` line (~line 144), add:

```ts
  private readonly logHandlers = new Set<LogHandler>();
  private readonly controlHandlers = new Set<ControlHandler>();
```

- [ ] **Step 3: Replace `parseMessage` with `parseRawData` + updated routing in `connect()`**

Replace the entire `private parseMessage` method and the `socket.onmessage` handler inside `connect()`:

The new `socket.onmessage` (inside `connect()`):

```ts
socket.onmessage = (event) => {
  const data = this.parseRawData(event.data);
  if (data === null || typeof data !== "object" || data === null) {
    return;
  }
  const obj = data as Record<string, unknown>;
  const stream = (obj.stream as StreamType | undefined) ?? "data";

  if (stream === "log") {
    for (const handler of this.logHandlers) {
      handler(obj.payload);
    }
    return;
  }

  if (stream === "control") {
    for (const handler of this.controlHandlers) {
      handler(obj.payload);
    }
    return;
  }

  // stream === "data" (or missing — backward compat)
  const wireEvent = coerceWireEvent(data);
  if (!wireEvent) {
    return;
  }
  this.lastByChannel.set(wireEvent.channel, wireEvent);
  for (const [pattern, handlers] of this.subscriptions) {
    if (!channelMatches(wireEvent.channel, pattern)) {
      continue;
    }
    for (const handler of handlers) {
      handler(wireEvent);
    }
  }
};
```

New private helper (replaces old `parseMessage`):

```ts
  private parseRawData(raw: unknown): unknown {
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }
```

- [ ] **Step 4: Add `onData`, `onLog`, `onControl` public methods** (after `publish`):

````ts
  /**
   * Alias for {@link subscribe} — subscribe to stream="data" channel messages.
   *
   * @param channelPattern Glob-style subscription pattern.
   * @param handler Callback invoked for matching events.
   * @returns Function that unsubscribes this handler.
   * @example
   * ```ts
   * const off = client.onData("sensor/*", (e) => console.log(e.payload));
   * off();
   * ```
   */
  public onData(channelPattern: string, handler: ChannelHandler): () => void {
    return this.subscribe(channelPattern, handler);
  }

  /**
   * Register a handler for stream="log" messages from the server.
   *
   * @param handler Callback invoked with each log payload.
   * @returns Function that unregisters this handler.
   * @example
   * ```ts
   * const off = client.onLog((payload) => console.log("[log]", payload));
   * off();
   * ```
   */
  public onLog(handler: LogHandler): () => void {
    this.logHandlers.add(handler);
    return () => {
      this.logHandlers.delete(handler);
    };
  }

  /**
   * Register a handler for stream="control" messages from the server.
   *
   * @param handler Callback invoked with each control payload.
   * @returns Function that unregisters this handler.
   * @example
   * ```ts
   * const off = client.onControl((payload) => console.log("[control]", payload));
   * off();
   * ```
   */
  public onControl(handler: ControlHandler): () => void {
    this.controlHandlers.add(handler);
    return () => {
      this.controlHandlers.delete(handler);
    };
  }
````

- [ ] **Step 5: Run existing TypeScript tests to verify nothing broke**

```
npm run test:ui
```

Expected: all 26 existing tests pass. The existing `hooks.test.tsx` tests send wire messages without a `stream` field — they default to `"data"` and route to channel handlers as before.

---

## Task 9: TypeScript — `useLogStream.ts` + tests

**Files:**

- Create: `packages/framework-core-ui/src/useLogStream.ts`
- Create: `packages/framework-core-ui/src/stream_hooks.test.tsx` (start with log stream test)

- [ ] **Step 1: Write the failing test in `stream_hooks.test.tsx`**

```tsx
// packages/framework-core-ui/src/stream_hooks.test.tsx
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EventBusProvider } from "./EventBusContext";
import { RealtimeEventBusClient, type WebSocketLike } from "./client";
import { useChannel } from "./useChannel";
import { useLogStream } from "./useLogStream";
import { useControlStream } from "./useControlStream";

class FakeWebSocket implements WebSocketLike {
  public static readonly OPEN = 1;

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public readyState = FakeWebSocket.OPEN;
  public readonly sent: string[] = [];

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.onclose?.({} as CloseEvent);
  }

  public open(): void {
    this.onopen?.({} as Event);
  }

  public receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe("stream hooks", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", host: "localhost:5173" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useLogStream returns latest log payload", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const log = useLogStream();
      useEffect(() => {
        seen.push(log);
      }, [log]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(JSON.stringify({ stream: "log", payload: "app started" }));
    });

    expect(seen.at(-1)).toBe("app started");
  });

  it("useLogStream updates on each new log message", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const log = useLogStream();
      useEffect(() => {
        if (log !== null) seen.push(log);
      }, [log]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(JSON.stringify({ stream: "log", payload: "first" }));
    });
    act(() => {
      socket.receive(JSON.stringify({ stream: "log", payload: "second" }));
    });

    expect(seen).toEqual(["first", "second"]);
  });
```

- [ ] **Step 2: Run to verify failure**

```
npm run test:ui -- stream_hooks
```

Expected: `Cannot find module './useLogStream'`

- [ ] **Step 3: Implement `useLogStream.ts`**

````ts
// packages/framework-core-ui/src/useLogStream.ts
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
````

- [ ] **Step 4: Run to verify log stream test passes**

```
npm run test:ui -- stream_hooks
```

Expected: log stream tests pass.

---

## Task 10: TypeScript — `useControlStream.ts` + remaining tests

**Files:**

- Create: `packages/framework-core-ui/src/useControlStream.ts`
- Modify: `packages/framework-core-ui/src/stream_hooks.test.tsx` (add remaining tests)

- [ ] **Step 1: Append remaining tests to `stream_hooks.test.tsx`**

Add inside the `describe("stream hooks")` block, after the log tests:

```tsx
  it("useControlStream returns latest control payload", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const ctrl = useControlStream();
      useEffect(() => {
        seen.push(ctrl);
      }, [ctrl]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(
        JSON.stringify({
          stream: "control",
          payload: { type: "heartbeat", timestamp: 123 },
        }),
      );
    });

    expect(seen.at(-1)).toEqual({ type: "heartbeat", timestamp: 123 });
  });

  it("useChannel ignores log and control stream messages", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    function Probe(): JSX.Element | null {
      const data = useChannel<Record<string, unknown>>("sensor/temperature");
      useEffect(() => {
        if (data !== null) seen.push(data);
      }, [data]);
      return null;
    }

    act(() => {
      create(
        <EventBusProvider path="/ws" webSocketFactory={() => socket}>
          <Probe />
        </EventBusProvider>,
      );
    });

    act(() => {
      socket.open();
      socket.receive(JSON.stringify({ stream: "log", payload: "some log text" }));
      socket.receive(
        JSON.stringify({ stream: "control", payload: { type: "heartbeat" } }),
      );
    });

    // No data messages — seen should still be empty.
    expect(seen).toHaveLength(0);

    act(() => {
      socket.receive(
        JSON.stringify({
          stream: "data",
          channel: "sensor/temperature",
          headers: { message_id: "m1", timestamp: 123 },
          payload: { value: 22.5 },
        }),
      );
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ value: 22.5 });
  });

  it("onData is an alias for subscribe and receives stream=data messages", () => {
    const socket = new FakeWebSocket();
    const seen: unknown[] = [];

    const client = new RealtimeEventBusClient("ws://localhost/ws", {
      webSocketFactory: () => socket,
    });
    client.start();
    const off = client.onData("sensor/*", (event) => seen.push(event.payload));

    socket.open();
    socket.receive(
      JSON.stringify({
        stream: "data",
        channel: "sensor/temperature",
        headers: { message_id: "m1", timestamp: 123 },
        payload: { value: 22.5 },
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ value: 22.5 });

    off();
    client.stop();
  });

  it("throws when useLogStream is used outside EventBusProvider", () => {
    function Probe(): JSX.Element | null {
      useLogStream();
      return null;
    }
    expect(() => {
      act(() => {
        create(<Probe />);
      });
    }).toThrow("EventBus hooks must be used inside EventBusProvider.");
  });

  it("throws when useControlStream is used outside EventBusProvider", () => {
    function Probe(): JSX.Element | null {
      useControlStream();
      return null;
    }
    expect(() => {
      act(() => {
        create(<Probe />);
      });
    }).toThrow("EventBus hooks must be used inside EventBusProvider.");
  });
}); // close describe
```

- [ ] **Step 2: Run to verify control stream and remaining tests fail**

```
npm run test:ui -- stream_hooks
```

Expected: `Cannot find module './useControlStream'`

- [ ] **Step 3: Implement `useControlStream.ts`**

````ts
// packages/framework-core-ui/src/useControlStream.ts
import { useEffect, useState } from "react";

import { useEventBusClient } from "./EventBusContext";

/**
 * Subscribe to ``stream="control"`` messages pushed by the server.
 *
 * Returns the payload of the latest control message, or ``null`` before the
 * first message arrives.  Control payloads typically look like
 * ``{ type: "heartbeat", timestamp: number }`` or
 * ``{ type: "status", … }``.
 *
 * @returns Latest control payload from the server, or `null`.
 * @example
 * ```tsx
 * const ctrl = useControlStream();
 * if (ctrl && typeof ctrl === "object" && (ctrl as any).type === "heartbeat") {
 *   // server is alive
 * }
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
````

- [ ] **Step 4: Run all TypeScript tests**

```
npm run test:ui
```

Expected: all tests pass (26 existing + new stream hook tests).

---

## Task 11: TypeScript — Update `index.ts` exports

**Files:**

- Modify: `packages/framework-core-ui/src/index.ts`

- [ ] **Step 1: Add exports for new hooks and types**

````ts
// packages/framework-core-ui/src/index.ts
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
````

- [ ] **Step 2: Run TypeScript typecheck and tests**

```
npm run typecheck && npm run test:ui
```

Expected: 0 errors, all tests pass.

---

## Task 12: Documentation — Update `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add wire format and stream types section**

In `CLAUDE.md`, after the `## Project Structure` section (before `## Key Entry Points`), add:

```markdown
## WebSocket Wire Format

Every message on the `/ws` WebSocket connection carries a `stream` discriminator:

| Stream    | Direction          | Shape                                                                                                      |
| --------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `data`    | both               | `{ "stream": "data", "channel": "…", "headers": { "message_id": "…", "timestamp": 123 }, "payload": {…} }` |
| `log`     | server→client only | `{ "stream": "log", "payload": "text" }`                                                                   |
| `control` | server→client only | `{ "stream": "control", "payload": { "type": "heartbeat"\|"status", … } }`                                 |

**Client → Server** messages for the `data` stream continue to use the existing action format (`subscribe`, `unsubscribe`, `publish`). The `stream` field is optional on inbound messages and defaults to `"data"` for backward compatibility.

### Python stream classes (framework-core)

- `framework_core.stream_types.StreamType` — `"data" | "log" | "control"` enum.
- `framework_core.stream_types.WireMessage` — Pydantic model for outgoing envelopes.
- `framework_core.log_stream.LogStream` — call `await app.state.log_stream.log("text")` to broadcast.
- `framework_core.control_stream.ControlStream` — call `await app.state.control_stream.send_status({…})` or schedule `start_heartbeat()`.

### TypeScript stream hooks (framework-core-ui)

- `useLogStream()` — returns the latest log payload (`unknown | null`).
- `useControlStream()` — returns the latest control payload (`unknown | null`).
- `client.onData(pattern, handler)` — alias for `client.subscribe`.
- `client.onLog(handler)` / `client.onControl(handler)` — stream-level subscriptions.
```

Also update the `## Project Structure` Python section to list the new files:

```markdown
- `src/framework_core/stream_types.py`: `StreamType` enum and `WireMessage` wire model.
- `src/framework_core/log_stream.py`: `LogStream` — broadcast log entries over WebSocket.
- `src/framework_core/control_stream.py`: `ControlStream` — broadcast heartbeat/status over WebSocket.
```

And the TypeScript section:

```markdown
- `src/useLogStream.ts`: `useLogStream` hook for stream="log" messages.
- `src/useControlStream.ts`: `useControlStream` hook for stream="control" messages.
```

- [ ] **Step 2: Run the full quality bar one final time**

```bash
uv run ruff check .
uv run mypy pypackages/framework-core/src
uv run pytest pypackages/framework-core/tests/ -q
npm run lint
npm run typecheck
npm run test:ui
```

Expected: all clean. Report results to user.

---

## Self-Review Against Spec

| Spec Requirement                                | Task                                    |
| ----------------------------------------------- | --------------------------------------- |
| `StreamType` enum: data, log, control           | Task 1                                  |
| `WireMessage` Pydantic model                    | Task 1                                  |
| ws_bridge routes by stream field                | Task 4                                  |
| EventBus tags outgoing with stream="data"       | Task 4                                  |
| `LogStream` — captures text, publishes as log   | Task 2                                  |
| `ControlStream` — heartbeat + status as control | Task 3                                  |
| Python tests for all of the above               | Tasks 1–3, 6                            |
| All 15 existing Python tests pass               | Tasks 4–5 verify                        |
| TS client routes by stream                      | Task 8                                  |
| `onData()`, `onLog()`, `onControl()`            | Task 8                                  |
| `useChannel` only processes stream=data         | Task 8 (client routing), Task 10 (test) |
| `useLogStream` hook + tests                     | Tasks 9–10                              |
| `useControlStream` hook + tests                 | Task 10                                 |
| All 26 existing TS tests pass                   | Tasks 8–10 verify                       |
| `examples/backend/main.py` shows all 3          | Task 7                                  |
| `CLAUDE.md` updated                             | Task 12                                 |
| JSDoc on new TS hooks                           | Tasks 9–10                              |
| Docstrings on new Python classes                | Tasks 1–3                               |
| Do NOT commit                                   | (no commit steps)                       |
