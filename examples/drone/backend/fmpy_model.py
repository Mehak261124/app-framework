"""FMPy adapter — build an initialised ``Drone.fmu`` co-simulation slave.

Isolates the heavy ``fmpy`` import and the FMU lifecycle (extract → optionally
recompile the platform binary → instantiate → initialise) so the rest of the
backend depends only on the small :class:`~fmu_runner.Fmu` protocol. The import
is lazy and failure is swallowed to ``None`` so the app still serves (data-less)
when FMPy or a C toolchain is missing — mirroring Reachy's renderer.
"""

from __future__ import annotations

import logging
from pathlib import Path

from .fmu_runner import Fmu

logger = logging.getLogger(__name__)

FMU_PATH = Path(__file__).parent / "Drone.fmu"
"""Location of the (gitignored) FMU; fetch it via ``fetch_fmu.py`` first."""


def load_fmu() -> Fmu | None:
    """Return a freshly instantiated, initialised FMI2 co-simulation slave.

    On non-Windows hosts the FMU ships no binary, so FMPy recompiles it from the
    bundled C sources on first use (needs a C toolchain).

    Returns:
        An initialised slave exposing ``setReal`` / ``doStep`` / ``getReal`` /
        ``terminate``, or ``None`` if FMPy is unavailable or the FMU is missing.
    """
    if not FMU_PATH.exists():
        logger.error(
            "Drone.fmu not found at %s — run `python -m "
            "examples.drone.backend.fetch_fmu` first",
            FMU_PATH,
        )
        return None

    try:
        from fmpy import extract, platform, read_model_description, supported_platforms
        from fmpy.fmi2 import FMU2Slave
        from fmpy.util import compile_platform_binary
    except Exception:  # pragma: no cover - depends on optional native deps
        logger.exception("FMPy unavailable; running without the drone simulation")
        return None

    try:
        if platform not in supported_platforms(str(FMU_PATH)):
            logger.info("Compiling Drone.fmu binary for %s (first run) …", platform)
            compile_platform_binary(str(FMU_PATH))

        md = read_model_description(str(FMU_PATH))
        unzip_dir = extract(str(FMU_PATH))
        fmu = FMU2Slave(
            guid=md.guid,
            unzipDirectory=unzip_dir,
            modelIdentifier=md.coSimulation.modelIdentifier,
            instanceName="drone",
        )
        fmu.instantiate()
        fmu.setupExperiment(startTime=0.0)
        fmu.enterInitializationMode()
        fmu.exitInitializationMode()
        return fmu
    except Exception:  # pragma: no cover - depends on native FMU at runtime
        logger.exception("Failed to initialise Drone.fmu")
        return None
