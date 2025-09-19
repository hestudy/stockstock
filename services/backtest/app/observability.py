"""
Minimal structured logging helpers for workers.
- No external dependencies; prints JSON lines to stdout.
- Fields: ts, level, component, jobId, ownerId, phase, duration_ms, retry, code, message
- Use mask() to protect PII.
- Enabled by OBS_ENABLED (defaults true).
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, Optional

OBS_ENABLED = (os.getenv("OBS_ENABLED", "true").lower() != "false")
COMPONENT = os.getenv("WORKER_COMPONENT", "backtest-worker")


def _ts() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())


def mask(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    v = str(value)
    if "@" in v and len(v) > 3:  # email
        name, _, domain = v.partition("@")
        return f"{name[:2]}***@{domain}"
    if v.isdigit() and len(v) >= 7:  # phone-like
        return v[:3] + "****" + v[-4:]
    return v[:3] + "***" if len(v) > 3 else "***"


def log(
    level: str,
    message: str,
    *,
    jobId: Optional[str] = None,
    ownerId: Optional[str] = None,
    phase: Optional[str] = None,
    duration_ms: Optional[float] = None,
    retry: Optional[int] = None,
    code: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    if not OBS_ENABLED:
        return
    payload: Dict[str, Any] = {
        "ts": _ts(),
        "level": level.lower(),
        "component": COMPONENT,
        "message": message,
    }
    if jobId:
        payload["jobId"] = jobId
    if ownerId:
        payload["ownerId"] = ownerId
    if phase:
        payload["phase"] = phase
    if duration_ms is not None:
        payload["duration_ms"] = round(float(duration_ms), 2)
    if retry is not None:
        payload["retry"] = int(retry)
    if code:
        payload["code"] = code
    if extra:
        # Best-effort JSON safety
        try:
            payload["extra"] = json.loads(json.dumps(extra))
        except Exception:
            payload["extra"] = {"note": "unserializable_extra"}
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class Timer:
    def __init__(self):
        self._start = time.perf_counter()

    def ms(self) -> float:
        return (time.perf_counter() - self._start) * 1000.0


# Convenience wrappers

def log_enqueue(jobId: str, ownerId: str, *, code: Optional[str] = None) -> None:
    log("info", "job enqueued", jobId=jobId, ownerId=ownerId, phase="enqueue", code=code)


def log_start(jobId: str, ownerId: str, *, retry: int = 0) -> Timer:
    log("info", "job started", jobId=jobId, ownerId=ownerId, phase="start", retry=retry)
    return Timer()


def log_end(jobId: str, ownerId: str, timer: Timer) -> None:
    log("info", "job finished", jobId=jobId, ownerId=ownerId, phase="end", duration_ms=timer.ms())


def log_error(
    jobId: str,
    ownerId: str,
    *,
    code: str,
    message: str,
    retry: int = 0,
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    # code is one of: PARAM_ERROR | UPSTREAM_ERROR | INTERNAL_ERROR
    safe_msg = (message or "").strip()[:300]
    log(
        "error",
        safe_msg,
        jobId=jobId,
        ownerId=ownerId,
        phase="error",
        retry=retry,
        code=code,
        extra=extra,
    )
