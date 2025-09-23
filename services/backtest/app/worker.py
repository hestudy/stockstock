"""Optimization worker loop utilities."""

from __future__ import annotations

from datetime import datetime
from typing import Callable, Optional

from . import orchestrator
from .observability import emit_metric, log_end, log_error, log_start


class WorkerError(Exception):
    """Exception raised by worker runners with explicit classification."""

    def __init__(self, message: str, kind: str = "internal") -> None:
        super().__init__(message)
        self.kind = kind


def process_next(
    owner_id: str,
    runner: Callable[[dict], Optional[float]],
) -> Optional[dict]:
    """Fetch the next task, execute runner, and record metrics.

    Returns a dict with task outcome or None if no task available.
    """

    task = orchestrator.dequeue_next(owner_id)
    if not task:
        emit_metric("active_jobs", 0.0, tags={"ownerId": owner_id})
        return None

    job_id = task["jobId"]
    task_id = task["id"]
    created_at = _parse_iso(task.get("createdAt"))
    wait_seconds = max((datetime.utcnow() - created_at).total_seconds(), 0.0)
    emit_metric(
        "queue_wait_seconds",
        wait_seconds,
        tags={"jobId": job_id, "taskId": task_id, "ownerId": owner_id},
    )

    timer = log_start(job_id, owner_id, retry=task.get("retries", 0))
    try:
        score_raw = runner(task)
        score = float(score_raw) if score_raw is not None else None
        orchestrator.mark_task_succeeded(job_id, task_id, score=score)
        log_end(job_id, owner_id, timer)
        _emit_active_jobs(job_id, owner_id)
        return {"status": "succeeded", "taskId": task_id, "score": score}
    except WorkerError as exc:
        error_code = _map_kind(exc.kind)
        failure = orchestrator.mark_task_failed(
            job_id,
            task_id,
            error_type=error_code,
            message=str(exc),
        )
        log_error(
            job_id,
            owner_id,
            code=error_code,
            message=str(exc),
            retry=failure.get("retries", 0),
        )
        _emit_active_jobs(job_id, owner_id)
        return {"status": "failed", "taskId": task_id, "error": error_code}
    except Exception as exc:  # pragma: no cover - defensive
        error_code = "INTERNAL_ERROR"
        failure = orchestrator.mark_task_failed(
            job_id,
            task_id,
            error_type=error_code,
            message=str(exc)[:200],
        )
        log_error(
            job_id,
            owner_id,
            code=error_code,
            message=str(exc),
            retry=failure.get("retries", 0),
        )
        _emit_active_jobs(job_id, owner_id)
        return {"status": "failed", "taskId": task_id, "error": error_code}


def _emit_active_jobs(job_id: str, owner_id: str) -> None:
    snapshot = orchestrator.get_job_status(job_id, owner_id)
    running = snapshot["summary"]["running"]
    emit_metric(
        "active_jobs",
        running,
        tags={"jobId": job_id, "ownerId": owner_id},
    )


def _map_kind(kind: Optional[str]) -> str:
    mapping = {
        "param": "PARAM_ERROR",
        "upstream": "UPSTREAM_ERROR",
        "internal": "INTERNAL_ERROR",
    }
    return mapping.get((kind or "internal").lower(), "INTERNAL_ERROR")


def _parse_iso(value: Optional[str]) -> datetime:
    if not value:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        # fallback for timestamps missing microseconds
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
