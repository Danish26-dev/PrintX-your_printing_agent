"""Job-scoped temporary file storage for the Document Engine.

Every processing request gets an isolated job directory under WORK_DIR. This
keeps a job's uploaded, intermediate, and output files together and makes
cleanup a single directory delete, which backs PrintX's privacy promise.

This layer is intentionally simple (local filesystem). In production the
Node Backend owns the authoritative lifecycle/S3; the engine only needs a safe
scratch space per request that it can wipe.
"""

from __future__ import annotations

import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from ..config import get_settings


@dataclass
class Job:
    """A single processing job with its own working directory."""

    job_id: str
    dir: Path

    def path(self, filename: str) -> Path:
        """Return a path inside the job dir, guarding against traversal."""
        safe = Path(filename).name  # strip any directory components
        if not safe:
            safe = "file"
        return self.dir / safe


def create_job() -> Job:
    settings = get_settings()
    job_id = uuid.uuid4().hex
    job_dir = settings.work_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return Job(job_id=job_id, dir=job_dir)


def get_job(job_id: str) -> Job | None:
    """Return an existing job by id, or None. Validates the id is a plain
    hex token to prevent path traversal."""
    if not job_id or not job_id.isalnum():
        return None
    settings = get_settings()
    job_dir = settings.work_dir / job_id
    if job_dir.is_dir():
        return Job(job_id=job_id, dir=job_dir)
    return None


def save_upload(job: Job, filename: str, content: bytes) -> Path:
    dest = job.path(filename)
    dest.write_bytes(content)
    return dest


def delete_job(job_id: str) -> bool:
    """Permanently remove a job's directory and all its files."""
    job = get_job(job_id)
    if job is None:
        return False
    shutil.rmtree(job.dir, ignore_errors=True)
    return not job.dir.exists()


def cleanup_expired(max_age_seconds: int) -> int:
    """Delete job directories older than max_age_seconds. Returns count removed.

    Provides a safety net so abandoned jobs do not linger, independent of the
    Backend's own lifecycle calls.
    """
    settings = get_settings()
    now = time.time()
    removed = 0
    for child in settings.work_dir.iterdir():
        if not child.is_dir():
            continue
        try:
            age = now - child.stat().st_mtime
        except OSError:
            continue
        if age > max_age_seconds:
            shutil.rmtree(child, ignore_errors=True)
            removed += 1
    return removed
