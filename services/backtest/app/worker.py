"""Optimization worker loop utilities."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Dict, Optional, Tuple

from . import orchestrator
from .observability import emit_metric, log_end, log_error, log_start


class WorkerError(Exception):
    """Exception raised by worker runners with explicit classification."""

    def __init__(self, message: str, kind: str = "internal") -> None:
        super().__init__(message)
        self.kind = kind


def process_next(
    owner_id: str,
    runner: Callable[[dict], Optional[Any]],
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
    tags = {"jobId": job_id, "taskId": task_id, "ownerId": owner_id}
    emit_metric("queue_wait_seconds", wait_seconds, tags=tags)

    timer = log_start(job_id, owner_id, retry=task.get("retries", 0))
    try:
        result = runner(task)
        score, result_summary_id = _normalize_result(result)
        payload = orchestrator.mark_task_succeeded(
            job_id,
            task_id,
            score=score,
            result_summary_id=result_summary_id,
        )
        duration_seconds = timer.ms() / 1000.0
        log_end(job_id, owner_id, timer)
        _emit_metrics(duration_seconds, payload.get("retries"), tags)
        _emit_active_jobs(job_id, owner_id)
        return {
            "status": "succeeded",
            "taskId": task_id,
            "taskStatus": payload.get("status"),
            "score": payload.get("score"),
            "resultSummaryId": payload.get("resultSummaryId"),
            "retries": payload.get("retries"),
        }
    except WorkerError as exc:
        error_code = _map_kind(exc.kind)
        failure = orchestrator.mark_task_failed(
            job_id,
            task_id,
            error_type=error_code,
            message=str(exc),
        )
        duration_seconds = timer.ms() / 1000.0
        log_error(
            job_id,
            owner_id,
            code=error_code,
            message=str(exc),
            retry=failure.get("retries", 0),
        )
        _emit_metrics(duration_seconds, failure.get("retries"), tags)
        _emit_active_jobs(job_id, owner_id)
        return {
            "status": "failed",
            "taskId": task_id,
            "taskStatus": failure.get("status"),
            "error": error_code,
            "retries": failure.get("retries"),
        }
    except Exception as exc:  # pragma: no cover - defensive
        error_code = "INTERNAL_ERROR"
        failure = orchestrator.mark_task_failed(
            job_id,
            task_id,
            error_type=error_code,
            message=str(exc)[:200],
        )
        duration_seconds = timer.ms() / 1000.0
        log_error(
            job_id,
            owner_id,
            code=error_code,
            message=str(exc),
            retry=failure.get("retries", 0),
        )
        _emit_metrics(duration_seconds, failure.get("retries"), tags)
        _emit_active_jobs(job_id, owner_id)
        return {
            "status": "failed",
            "taskId": task_id,
            "taskStatus": failure.get("status"),
            "error": error_code,
            "retries": failure.get("retries"),
        }


def _emit_metrics(duration_seconds: float, retries: Optional[int], tags: Dict[str, Any]) -> None:
    emit_metric("job_exec_seconds", duration_seconds, tags=tags)
    if retries is not None:
        emit_metric("job_retry_total", float(retries), tags=tags)


def _normalize_result(result: Any) -> Tuple[Optional[float], Optional[str]]:
    if result is None:
        return None, None
    if isinstance(result, (int, float)):
        return float(result), None
    if isinstance(result, dict):
        score_raw = result.get("score")
        summary_raw = result.get("resultSummaryId") or result.get("result_summary_id")
        score = float(score_raw) if score_raw is not None else None
        summary_id = str(summary_raw) if summary_raw is not None else None
        return score, summary_id
    if isinstance(result, (list, tuple)):
        score_raw = result[0] if len(result) > 0 else None
        summary_raw = result[1] if len(result) > 1 else None
        score = float(score_raw) if score_raw is not None else None
        summary_id = str(summary_raw) if summary_raw is not None else None
        return score, summary_id
    raise WorkerError("runner returned unsupported result payload", kind="internal")


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
