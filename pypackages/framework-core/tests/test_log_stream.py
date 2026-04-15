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
    await stream.log("error resilience test")


@pytest.mark.anyio
async def test_log_with_no_connections_is_a_no_op() -> None:
    stream = LogStream()
    await stream.log("silent log")
