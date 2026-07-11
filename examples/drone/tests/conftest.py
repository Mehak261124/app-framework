"""Pytest configuration and shared fixtures for the drone example tests.

Adds the project root to sys.path so that ``examples.drone`` is importable as a
namespace package without installing it into the environment (mirrors the
Reachy example's conftest).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).parent.parent.parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
