"""Runtime configuration for the PrintX Document Engine.

Values are read from environment variables (see .env.example). Nothing here
performs document logic; this module only resolves settings and the path to
the LibreOffice binary used for DOCX -> PDF conversion.
"""

from __future__ import annotations

import os
import shutil
from functools import lru_cache
from pathlib import Path


# Common install locations for the LibreOffice headless binary, checked when
# SOFFICE_PATH is not set and it is not already on PATH.
_SOFFICE_CANDIDATES = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/opt/libreoffice/program/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
]


class Settings:
    """Resolved configuration for the service."""

    def __init__(self) -> None:
        self.port: int = int(os.getenv("PORT", "5001"))
        self.work_dir: Path = Path(os.getenv("WORK_DIR", "./_work")).resolve()
        # LibreOffice DOCX->PDF convert budget. This is the INNERMOST timeout in
        # the system-wide hierarchy and must stay BELOW the agent's per-call
        # engine budget (default 100s) so a stuck conversion fails here with a
        # specific ConversionError instead of an upstream generic abort:
        #   convert (90s) < agent->engine (100s) < backend->agent (180s).
        self.convert_timeout: int = int(os.getenv("CONVERT_TIMEOUT", "90"))
        self._soffice_override: str = os.getenv("SOFFICE_PATH", "").strip()

        # Ensure the working directory exists on startup.
        self.work_dir.mkdir(parents=True, exist_ok=True)

    def resolve_soffice(self) -> str | None:
        """Return an absolute path to the LibreOffice binary, or None.

        Order of resolution:
          1. Explicit SOFFICE_PATH env var (if it exists on disk).
          2. `soffice` / `libreoffice` on PATH.
          3. Known install locations.
        Returns None if LibreOffice cannot be found, so callers can surface a
        clear, non-crashing error instead of failing obscurely.
        """
        if self._soffice_override and Path(self._soffice_override).exists():
            return self._soffice_override

        for name in ("soffice", "libreoffice"):
            found = shutil.which(name)
            if found:
                return found

        for candidate in _SOFFICE_CANDIDATES:
            if Path(candidate).exists():
                return candidate

        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
