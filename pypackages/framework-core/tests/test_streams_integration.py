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
    assert received["stream"] == "data"


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
        marker["ok"] = isinstance(app.state.log_stream, LogStream) and isinstance(
            app.state.control_stream, ControlStream
        )
        yield

    app = create_app(lifespan=check_lifespan)
    with TestClient(app):
        pass

    assert marker["ok"]
