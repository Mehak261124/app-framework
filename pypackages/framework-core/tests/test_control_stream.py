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
