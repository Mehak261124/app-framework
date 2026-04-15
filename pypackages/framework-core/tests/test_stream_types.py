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
