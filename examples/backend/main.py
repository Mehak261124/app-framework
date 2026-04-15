from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from framework_core import create_app

from .consumers import register_consumers
from .producers import start_log_producer, start_sine_wave_producer


async def _start_log_stream_demo(app: FastAPI) -> None:
    """Periodically emit free-text entries to the log stream (stream="log")."""
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
