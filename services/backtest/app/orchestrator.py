"""Queue orchestration with concurrency control, retries, and summary aggregation."""

from __future__ import annotations

import itertools
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from threading import RLock
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

try:
    from sqlalchemy import (
        Column,
        DateTime,
        Integer,
        Float,
        Boolean,
        JSON,
        MetaData,
        String,
        Table,
        create_engine,
        insert,
        delete,
        select,
        update,
    )
    from sqlalchemy.dialects.postgresql import JSONB
    from sqlalchemy.engine import Engine
    from sqlalchemy.exc import SQLAlchemyError
except Exception:  # pragma: no cover - optional dependency
    create_engine = None
    Engine = None
    Boolean = Column = DateTime = Integer = JSON = MetaData = String = Table = insert = select = update = delete = Float = None

from .observability import emit_metric, log_stop

JobStatus = str
DEFAULT_STATUS: JobStatus = "queued"
DEFAULT_LIMIT = 500
DEFAULT_CONCURRENCY_MAX = 16
MAX_SAFE_PRODUCT = DEFAULT_LIMIT * 4
MAX_TASK_CAP = 1000
DEFAULT_TOP_N = 5
DEFAULT_MAX_RETRIES = 5
DEFAULT_RETRY_BASE_SECONDS = 2
FINISHED_STATUSES = {"succeeded", "failed", "early-stopped", "canceled"}


def iso_now() -> str:
    return datetime.utcnow().isoformat()


class ParamInvalidError(Exception):
    """Raised when the provided parameter space cannot be processed."""

    code = "E.PARAM_INVALID"
    status = 400

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


class JobAccessError(Exception):
    """Raised when job lookup fails or owner mismatch occurs."""

    def __init__(self, message: str, code: str, status: int, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = details or {}


@dataclass
class EarlyStopPolicy:
    metric: str
    threshold: float
    mode: str  # "min" | "max"


@dataclass
class OptimizationTask:
    id: str
    job_id: str
    owner_id: str
    version_id: str
    params: Dict[str, Any]
    status: JobStatus = DEFAULT_STATUS
    progress: Optional[float] = None
    retries: int = 0
    error: Optional[Dict[str, Any]] = None
    result_summary_id: Optional[str] = None
    score: Optional[float] = None
    throttled: bool = False
    next_run_at: datetime = field(default_factory=datetime.utcnow)
    last_error: Optional[Dict[str, Any]] = None
    created_at: str = field(default_factory=iso_now)
    updated_at: str = field(default_factory=iso_now)


@dataclass
class OptimizationSummary:
    total: int
    finished: int
    running: int
    throttled: int
    top_n: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class OptimizationJob:
    id: str
    owner_id: str
    version_id: str
    param_space: Dict[str, Any]
    normalized_space: Dict[str, Sequence[Any]] = field(default_factory=dict)
    concurrency_limit: int = 0
    early_stop_policy: Optional[EarlyStopPolicy] = None
    status: JobStatus = DEFAULT_STATUS
    total_tasks: int = 0
    estimate: int = 0
    summary: OptimizationSummary = field(default_factory=lambda: OptimizationSummary(0, 0, 0, 0))
    created_at: str = field(default_factory=iso_now)
    updated_at: str = field(default_factory=iso_now)
    locked_status: Optional[JobStatus] = None
    stop_reason: Optional[Dict[str, Any]] = None
    source_job_id: Optional[str] = None


_JOBS: Dict[str, OptimizationJob] = {}
_TASKS: Dict[str, Dict[str, OptimizationTask]] = {}
_TASK_ORDER: Dict[str, List[str]] = {}
_JOB_ORDER: List[str] = []
_RESULT_SUMMARIES: Dict[str, Dict[str, Any]] = {}
_STORE_LOCK = RLock()

if JSON is not None:
    try:  # pragma: no cover - variant not available on all platforms
        from sqlalchemy import Text

        JSON_TYPE = JSON().with_variant(JSONB(astext_type=Text()), "postgresql") if JSONB else JSON()
    except Exception:  # pragma: no cover - fallback to generic JSON
        JSON_TYPE = JSON()
else:  # SQLAlchemy not installed
    JSON_TYPE = None

if JSON_TYPE is not None:
    _METADATA = MetaData()
    _JOBS_TABLE = Table(
        "optimization_jobs",
        _METADATA,
        Column("id", String, primary_key=True),
        Column("owner_id", String, nullable=False),
        Column("strategy_version_id", String, nullable=False),
        Column("param_space", JSON_TYPE, nullable=False),
        Column("concurrency_limit", Integer, nullable=False),
        Column("early_stop_policy", JSON_TYPE),
        Column("status", String, nullable=False),
        Column("total_tasks", Integer),
        Column("estimate", Integer),
        Column("summary", JSON_TYPE),
        Column("result_summary_id", String),
        Column("created_at", DateTime(timezone=True)),
        Column("updated_at", DateTime(timezone=True)),
        extend_existing=True,
    )
    _TASKS_TABLE = Table(
        "optimization_tasks",
        _METADATA,
        Column("id", String, primary_key=True),
        Column("job_id", String, nullable=False),
        Column("owner_id", String, nullable=False),
        Column("strategy_version_id", String, nullable=False),
        Column("param_set", JSON_TYPE, nullable=False),
        Column("status", String, nullable=False),
        Column("progress", Float),
        Column("retries", Integer, nullable=False, default=0),
        Column("next_run_at", DateTime(timezone=True)),
        Column("throttled", Boolean, nullable=False, default=False),
        Column("error", JSON_TYPE),
        Column("last_error", JSON_TYPE),
        Column("result_summary_id", String),
        Column("score", Float),
        Column("created_at", DateTime(timezone=True)),
        Column("updated_at", DateTime(timezone=True)),
        extend_existing=True,
    )
else:  # SQLAlchemy unavailable
    _METADATA = None
    _JOBS_TABLE = None
    _TASKS_TABLE = None


def _clear_memory() -> None:
    """Clear in-memory job/task caches."""

    with _STORE_LOCK:
        _JOBS.clear()
        _TASKS.clear()
        _TASK_ORDER.clear()
        _JOB_ORDER.clear()
        _RESULT_SUMMARIES.clear()


# ==== Environment helpers ====

def get_param_limit() -> int:
    raw = os.getenv("OPT_PARAM_SPACE_MAX")
    if not raw:
        return DEFAULT_LIMIT
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_LIMIT
    return max(1, value)


def get_concurrency_limit_max() -> int:
    raw = os.getenv("OPT_CONCURRENCY_LIMIT_MAX")
    if not raw:
        return DEFAULT_CONCURRENCY_MAX
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_CONCURRENCY_MAX
    return max(1, value)


def get_top_n_limit() -> int:
    raw = os.getenv("OPT_TOP_N_LIMIT")
    if not raw:
        return DEFAULT_TOP_N
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_TOP_N
    return max(1, value)


def get_max_retries() -> int:
    raw = os.getenv("OPT_MAX_RETRIES")
    if not raw:
        return DEFAULT_MAX_RETRIES
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_RETRIES
    return max(0, value)


def get_retry_base_seconds() -> int:
    raw = os.getenv("OPT_RETRY_BASE_SECONDS")
    if not raw:
        return DEFAULT_RETRY_BASE_SECONDS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_RETRY_BASE_SECONDS
    return max(1, value)


# ==== Parameter normalization ====

def summarize_param_space(
    param_space: Dict[str, Any]
) -> Tuple[Dict[str, Sequence[Any]], int]:
    if not isinstance(param_space, dict) or not param_space:
        raise ParamInvalidError("paramSpace must be a non-empty object")
    normalized: Dict[str, Sequence[Any]] = {}
    estimate = 1
    limit = get_param_limit()
    for key, raw in param_space.items():
        values = normalize_dimension(key, raw)
        normalized[key] = values
        estimate = safe_multiply(estimate, len(values), limit)
    return normalized, estimate


def normalize_dimension(key: str, raw: Any) -> Sequence[Any]:
    if isinstance(raw, list):
        values = [v for v in raw if v is not None]
        if not values:
            raise ParamInvalidError(f"paramSpace.{key} requires at least one value")
        return values
    if isinstance(raw, dict) and {"start", "end", "step"}.issubset(raw.keys()):
        return expand_range(key, raw)
    if isinstance(raw, (int, float, str, bool)):
        return [raw]
    raise ParamInvalidError(f"paramSpace.{key} is unsupported")


def expand_range(key: str, raw: Dict[str, Any]) -> Sequence[Any]:
    try:
        start = float(raw["start"])
        end = float(raw["end"])
        step = float(raw["step"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ParamInvalidError(
            f"paramSpace.{key} range requires numeric start/end/step"
        ) from exc
    if step <= 0:
        raise ParamInvalidError(f"paramSpace.{key} step must be > 0")
    values: List[float] = []
    ascending = end >= start
    current = start
    guard = 1_000_000
    iterations = 0
    while (current <= end if ascending else current >= end) and iterations < guard:
        values.append(round(current, 12))
        current = current + step if ascending else current - step
        iterations += 1
    if iterations >= guard:
        raise ParamInvalidError(f"paramSpace.{key} range produced too many values")
    if not values:
        raise ParamInvalidError(f"paramSpace.{key} range produced no values")
    return values


def safe_multiply(current: int, factor: int, limit: int) -> int:
    if factor <= 0:
        raise ParamInvalidError("param space dimension must contain values", {"factor": factor})
    product = current * factor
    if product > max(limit, DEFAULT_LIMIT) * 4:
        raise ParamInvalidError(
            "param space exceeds safe processing window",
            {"estimate": product, "limit": limit},
        )
    return product


def normalize_concurrency_limit(limit: int) -> int:
    if limit <= 0:
        raise ParamInvalidError(
            "concurrency limit must be positive",
            {"concurrency": limit},
        )
    max_limit = get_concurrency_limit_max()
    if limit > max_limit:
        raise ParamInvalidError(
            "concurrency limit exceeds maximum",
            {"limit": max_limit, "requested": limit},
        )
    return limit


def expand_param_space(normalized: Dict[str, Sequence[Any]]) -> Iterable[Dict[str, Any]]:
    keys = list(normalized.keys())
    value_lists = [normalized[k] for k in keys]
    for combo in itertools.product(*value_lists):
        yield dict(zip(keys, combo))


# ==== Orchestration core ==== 

def create_optimization_job(
    *,
    owner_id: str,
    version_id: str,
    param_space: Dict[str, Any],
    concurrency_limit: int,
    early_stop_policy: Optional[Dict[str, Any]] = None,
    estimate: Optional[int] = None,
    source_job_id: Optional[str] = None,
) -> Dict[str, Any]:
    normalized, computed_estimate = summarize_param_space(param_space)
    limit = get_param_limit()
    if computed_estimate > limit:
        raise ParamInvalidError(
            "param space too large",
            {"limit": limit, "estimate": computed_estimate},
        )
    sanitized_concurrency = normalize_concurrency_limit(concurrency_limit)
    job_id = str(uuid.uuid4())
    policy_obj = None
    if early_stop_policy:
        policy_obj = EarlyStopPolicy(
            metric=str(early_stop_policy.get("metric", "")),
            threshold=float(early_stop_policy.get("threshold", 0.0)),
            mode=str(early_stop_policy.get("mode", "min")),
        )
    tasks = list(_generate_tasks(job_id, owner_id, version_id, normalized, sanitized_concurrency))
    total_tasks = len(tasks)
    job = OptimizationJob(
        id=job_id,
        owner_id=owner_id,
        version_id=version_id,
        param_space=param_space,
        normalized_space=normalized,
        concurrency_limit=sanitized_concurrency,
        early_stop_policy=policy_obj,
        status=DEFAULT_STATUS,
        total_tasks=total_tasks,
        estimate=estimate or computed_estimate,
        summary=_initial_summary(total_tasks, tasks),
        source_job_id=source_job_id,
    )
    with _STORE_LOCK:
        _JOBS[job_id] = job
        _TASKS[job_id] = {task.id: task for task in tasks}
        _TASK_ORDER[job_id] = [task.id for task in tasks]
        if job_id not in _JOB_ORDER:
            _JOB_ORDER.append(job_id)
    if _PERSISTENCE.enabled:
        _PERSISTENCE.persist_job(job, tasks)
    if job.summary.throttled > 0:
        emit_metric(
            "throttled_requests",
            job.summary.throttled,
            tags={"jobId": job_id, "ownerId": owner_id},
        )
    return {
        "id": job_id,
        "status": job.status,
        "throttled": job.summary.throttled > 0,
        "totalTasks": total_tasks,
        "sourceJobId": source_job_id,
    }


def dequeue_next(owner_id: str, job_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with _STORE_LOCK:
        now = datetime.utcnow()
        job_ids = [job_id] if job_id else list(_JOB_ORDER)
        for jid in job_ids:
            job = _JOBS.get(jid)
            if not job or job.owner_id != owner_id:
                continue
            if job.locked_status:
                continue
            _activate_slots(job)
            running = _count_status(job.id, "running")
            if running >= job.concurrency_limit:
                continue
            for tid in _TASK_ORDER[jid]:
                task = _TASKS[jid][tid]
                if task.status == "queued" and not task.throttled and task.next_run_at <= now:
                    task.status = "running"
                    task.progress = 0.0
                    task.updated_at = iso_now()
                    task.last_error = None
                    job.status = "running"
                    if _PERSISTENCE.enabled:
                        _PERSISTENCE.update_task(task)
                    _refresh_summary(job)
                    return _task_to_dict(task)
    return None


def mark_task_succeeded(
    job_id: str,
    task_id: str,
    *,
    score: Optional[float] = None,
    result_summary_id: Optional[str] = None,
) -> Dict[str, Any]:
    with _STORE_LOCK:
        job, task = _get_job_and_task(job_id, task_id)
        if job.locked_status:
            return _task_to_dict(task)
        task.status = "succeeded"
        if score is not None:
            task.score = float(score)
        task.result_summary_id = result_summary_id
        task.throttled = False
        task.progress = 1.0
        task.updated_at = iso_now()
        task.next_run_at = datetime.utcnow()
        task.error = None
        task.last_error = None
        _ensure_result_summary(task)
        if _PERSISTENCE.enabled:
            _PERSISTENCE.update_task(task)
        _activate_slots(job)
        _refresh_summary(job)
        _maybe_trigger_early_stop(job)
        return _task_to_dict(task)


def mark_task_failed(
    job_id: str,
    task_id: str,
    *,
    error_type: str,
    message: str,
) -> Dict[str, Any]:
    with _STORE_LOCK:
        job, task = _get_job_and_task(job_id, task_id)
        if job.locked_status:
            return _task_to_dict(task)
        now = datetime.utcnow()
        task.updated_at = iso_now()
        task.last_error = {"code": error_type, "message": message}
        task.error = task.last_error
        retryable = error_type in {"UPSTREAM_ERROR", "INTERNAL_ERROR"}
        max_retries = get_max_retries()
        if task.status == "running":
            task.status = "queued"
        if retryable and task.retries < max_retries:
            task.retries += 1
            delay = get_retry_base_seconds() * (2 ** (task.retries - 1))
            task.next_run_at = now + timedelta(seconds=delay)
            task.throttled = False
            task.progress = None
        else:
            task.status = "failed"
            task.throttled = False
            task.next_run_at = now
        if _PERSISTENCE.enabled:
            _PERSISTENCE.update_task(task)
        _activate_slots(job)
        _refresh_summary(job)
        return _task_to_dict(task)


def get_job_status(job_id: str, owner_id: str) -> Dict[str, Any]:
    with _STORE_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise JobAccessError("optimization job not found", "E.NOT_FOUND", 404, {"jobId": job_id})
        if job.owner_id != owner_id:
            raise JobAccessError(
                "job does not belong to current owner",
                "E.FORBIDDEN",
                403,
                {"jobId": job_id, "ownerId": owner_id},
            )
        _refresh_summary(job)
        return _job_payload(job)


def get_job_snapshot(job_id: str, owner_id: str) -> Dict[str, Any]:
    with _STORE_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise JobAccessError("optimization job not found", "E.NOT_FOUND", 404, {"jobId": job_id})
        if job.owner_id != owner_id:
            raise JobAccessError(
                "job does not belong to current owner",
                "E.FORBIDDEN",
                403,
                {"jobId": job_id, "ownerId": owner_id},
            )
        _refresh_summary(job)
        return {
            "id": job.id,
            "ownerId": job.owner_id,
            "versionId": job.version_id,
            "paramSpace": job.param_space,
            "concurrencyLimit": job.concurrency_limit,
            "earlyStopPolicy": _policy_to_dict(job.early_stop_policy),
            "status": job.status,
            "totalTasks": job.total_tasks,
            "summary": _summary_to_dict(job.summary),
            "createdAt": job.created_at,
            "updatedAt": job.updated_at,
            "sourceJobId": job.source_job_id,
        }


def cancel_job(job_id: str, owner_id: str, *, reason: Optional[str] = None) -> Dict[str, Any]:
    with _STORE_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise JobAccessError("optimization job not found", "E.NOT_FOUND", 404, {"jobId": job_id})
        if job.owner_id != owner_id:
            raise JobAccessError(
                "job does not belong to current owner",
                "E.FORBIDDEN",
                403,
                {"jobId": job_id, "ownerId": owner_id},
            )
        reason_payload: Dict[str, Any] = {"kind": "CANCELED"}
        if reason:
            reason_payload["reason"] = reason
        _lock_job(job, "canceled", reason=reason_payload)
        return _job_payload(job)


def export_top_n_bundle(job_id: str, owner_id: str) -> Dict[str, Any]:
    with _STORE_LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise JobAccessError("optimization job not found", "E.NOT_FOUND", 404, {"jobId": job_id})
        if job.owner_id != owner_id:
            raise JobAccessError(
                "job does not belong to current owner",
                "E.FORBIDDEN",
                403,
                {"jobId": job_id, "ownerId": owner_id},
            )
        _refresh_summary(job)
        task_map = _TASKS.get(job_id, {})
        items: List[Dict[str, Any]] = []
        for entry in job.summary.top_n:
            task_id = entry.get("taskId")
            task = task_map.get(task_id) if isinstance(task_map, dict) else None
            summary = _ensure_result_summary(task) if task else None
            items.append(
                {
                    "taskId": task_id,
                    "score": entry.get("score"),
                    "params": task.params if task else {},
                    "resultSummaryId": entry.get("resultSummaryId"),
                    "metrics": (summary or {}).get("metrics"),
                    "artifacts": (summary or {}).get("artifacts"),
                }
            )
        return {
            "jobId": job.id,
            "status": job.status,
            "generatedAt": iso_now(),
            "summary": _summary_to_dict(job.summary),
            "items": items,
        }


# ==== Internal helpers ====

def _generate_tasks(
    job_id: str,
    owner_id: str,
    version_id: str,
    normalized: Dict[str, Sequence[Any]],
    concurrency_limit: int,
) -> Iterator[OptimizationTask]:
    combos = list(expand_param_space(normalized))
    if not combos:
        return
    cap = min(len(combos), MAX_TASK_CAP)
    now = datetime.utcnow()
    for index in range(cap):
        params = combos[index]
        throttled = index >= concurrency_limit
        yield OptimizationTask(
            id=str(uuid.uuid4()),
            job_id=job_id,
            owner_id=owner_id,
            version_id=version_id,
            params=params,
            status=DEFAULT_STATUS,
            throttled=throttled,
            next_run_at=now,
        )


def _initial_summary(total: int, tasks: List[OptimizationTask]) -> OptimizationSummary:
    throttled = sum(1 for task in tasks if task.throttled)
    return OptimizationSummary(
        total=total,
        finished=0,
        running=0,
        throttled=throttled,
        top_n=[],
    )


def _ensure_result_summary(task: OptimizationTask) -> Optional[Dict[str, Any]]:
    result_id = task.result_summary_id
    if not result_id:
        return None
    summary = _RESULT_SUMMARIES.get(result_id)
    if summary is None:
        summary = {
            "id": result_id,
            "ownerId": task.owner_id,
            "metrics": {},
            "artifacts": _build_artifacts(result_id),
            "createdAt": iso_now(),
            "equityCurveRef": f"/artifacts/{result_id}/equity.csv",
            "tradesRef": f"/artifacts/{result_id}/trades.csv",
        }
        _RESULT_SUMMARIES[result_id] = summary
    if task.score is not None:
        metrics = summary.setdefault("metrics", {})
        metrics["score"] = float(task.score)
    return summary


def _refresh_summary(job: OptimizationJob, *, persist: bool = True) -> None:
    tasks = list(_TASKS[job.id].values())
    prev_status = job.status
    prev_summary = _summary_to_dict(job.summary)
    finished = sum(1 for task in tasks if task.status in FINISHED_STATUSES)
    running = sum(1 for task in tasks if task.status == "running")
    throttled = sum(1 for task in tasks if task.throttled)
    top_limit = get_top_n_limit()
    scored = [task for task in tasks if task.score is not None]
    mode = "max"
    if job.early_stop_policy and isinstance(job.early_stop_policy.mode, str):
        mode = job.early_stop_policy.mode.lower()

    def _topn_key(task: OptimizationTask) -> float:
        if task.score is None:
            return float("inf") if mode == "min" else float("-inf")
        return float(task.score)

    scored.sort(key=_topn_key, reverse=mode != "min")
    top_n = []
    for task in scored[:top_limit]:
        summary = _ensure_result_summary(task)
        entry = {"taskId": task.id, "score": float(task.score)}
        if task.result_summary_id:
            entry["resultSummaryId"] = task.result_summary_id
        if summary and "score" in summary.get("metrics", {}):
            entry["score"] = float(summary["metrics"]["score"])
        top_n.append(entry)
    job.summary = OptimizationSummary(
        total=job.total_tasks,
        finished=finished,
        running=running,
        throttled=throttled,
        top_n=top_n,
    )
    new_status = job.status
    if job.locked_status:
        new_status = job.locked_status
    elif finished >= job.total_tasks:
        new_status = "succeeded"
        if any(task.status == "failed" for task in tasks):
            new_status = "failed"
    elif running > 0:
        new_status = "running"
    else:
        new_status = DEFAULT_STATUS
    job.status = new_status

    changed = (
        prev_status != job.status
        or prev_summary != _summary_to_dict(job.summary)
    )
    if changed:
        job.updated_at = iso_now()
    if persist and changed:
        _PERSISTENCE.update_job(job)


def _activate_slots(job: OptimizationJob) -> None:
    tasks = _TASKS.get(job.id)
    if not tasks:
        return
    now = datetime.utcnow()
    running = _count_status(job.id, "running")
    ready = sum(
        1
        for task in tasks.values()
        if task.status == "queued" and not task.throttled and task.next_run_at <= now
    )
    capacity = max(job.concurrency_limit - running - ready, 0)
    if capacity <= 0:
        return
    for task_id in _TASK_ORDER[job.id]:
        if capacity <= 0:
            break
        task = tasks[task_id]
        if task.status == "queued" and task.throttled:
            task.throttled = False
            task.next_run_at = min(task.next_run_at, now)
            task.updated_at = iso_now()
            if _PERSISTENCE.enabled:
                _PERSISTENCE.update_task(task)
            capacity -= 1


def _count_status(job_id: str, status: JobStatus) -> int:
    if job_id not in _TASKS:
        return 0
    return sum(1 for task in _TASKS[job_id].values() if task.status == status)


def _get_job_and_task(job_id: str, task_id: str) -> (OptimizationJob, OptimizationTask):
    job = _JOBS.get(job_id)
    if not job:
        raise JobAccessError("optimization job not found", "E.NOT_FOUND", 404, {"jobId": job_id})
    tasks = _TASKS.get(job_id)
    if not tasks or task_id not in tasks:
        raise JobAccessError("task not found", "E.NOT_FOUND", 404, {"jobId": job_id, "taskId": task_id})
    return job, tasks[task_id]


def _task_to_dict(task: OptimizationTask) -> Dict[str, Any]:
    return {
        "id": task.id,
        "jobId": task.job_id,
        "ownerId": task.owner_id,
        "versionId": task.version_id,
        "params": task.params,
        "status": task.status,
        "progress": task.progress,
        "retries": task.retries,
        "error": task.error,
        "resultSummaryId": task.result_summary_id,
        "score": task.score,
        "throttled": task.throttled,
        "nextRunAt": task.next_run_at.isoformat(),
        "lastError": task.last_error,
        "createdAt": task.created_at,
        "updatedAt": task.updated_at,
    }


def _policy_to_dict(policy: Optional[EarlyStopPolicy]) -> Optional[Dict[str, Any]]:
    if not policy:
        return None
    return {
        "metric": policy.metric,
        "threshold": policy.threshold,
        "mode": policy.mode,
    }


def _maybe_trigger_early_stop(job: OptimizationJob) -> None:
    if job.locked_status or not job.early_stop_policy:
        return
    summary = job.summary
    top_entries = summary.top_n or []
    if not top_entries:
        return
    scores = [entry.get("score") for entry in top_entries if isinstance(entry.get("score"), (int, float))]
    if not scores:
        return
    policy = job.early_stop_policy
    mode = (policy.mode or "max").lower()
    best_score = min(scores) if mode == "min" else max(scores)
    threshold = policy.threshold
    should_stop = (mode == "min" and best_score <= threshold) or (mode != "min" and best_score >= threshold)
    if not should_stop:
        return
    reason = {
        "kind": "EARLY_STOP_THRESHOLD",
        "metric": policy.metric,
        "threshold": threshold,
        "score": best_score,
        "mode": mode,
    }
    _lock_job(job, "early-stopped", reason=reason)


def _lock_job(
    job: OptimizationJob,
    status: JobStatus,
    *,
    reason: Optional[Dict[str, Any]] = None,
) -> None:
    if job.locked_status == status:
        return
    job.locked_status = status
    job.stop_reason = reason
    job.status = status
    job.updated_at = iso_now()
    tasks = _TASKS.get(job.id, {})
    now = datetime.utcnow()
    for task in tasks.values():
        if task.status not in FINISHED_STATUSES:
            task.status = status
            task.progress = 1.0
            task.throttled = False
            task.next_run_at = now
            task.updated_at = iso_now()
            task.error = None
            task.last_error = None
            if _PERSISTENCE.enabled:
                _PERSISTENCE.update_task(task)
    tags = {
        "jobId": job.id,
        "ownerId": job.owner_id,
        "status": status,
        "stopKind": (reason or {}).get("kind", "unknown"),
    }
    emit_metric("job_stop_total", 1.0, tags=tags)
    threshold_value = _to_float((reason or {}).get("threshold"))
    if threshold_value is not None:
        emit_metric("job_stop_threshold", threshold_value, tags=tags)
    score_value = _to_float((reason or {}).get("score"))
    if score_value is not None:
        emit_metric("job_stop_score", score_value, tags=tags)
    log_stop(job.id, job.owner_id, status, reason=reason)
    _refresh_summary(job)
    if _PERSISTENCE.enabled:
        _PERSISTENCE.update_job(job)


def _build_artifacts(result_id: str) -> List[Dict[str, str]]:
    return [
        {"type": "metrics", "url": f"/artifacts/{result_id}/metrics.json"},
        {"type": "equity", "url": f"/artifacts/{result_id}/equity.csv"},
        {"type": "trades", "url": f"/artifacts/{result_id}/trades.csv"},
    ]


def _job_payload(job: OptimizationJob) -> Dict[str, Any]:
    summary = job.summary
    diagnostics: Dict[str, Any] = {
        "throttled": summary.throttled > 0,
        "queueDepth": summary.throttled,
        "running": summary.running,
    }
    if job.stop_reason:
        diagnostics["stopReason"] = job.stop_reason
    if job.locked_status:
        diagnostics["final"] = True
    return {
        "id": job.id,
        "status": job.status,
        "totalTasks": job.total_tasks,
        "concurrencyLimit": job.concurrency_limit,
        "summary": {
            "total": summary.total,
            "finished": summary.finished,
            "running": summary.running,
            "throttled": summary.throttled,
            "topN": [dict(entry) for entry in summary.top_n],
        },
        "diagnostics": diagnostics,
        "earlyStopPolicy": _policy_to_dict(job.early_stop_policy),
        "sourceJobId": job.source_job_id,
    }


def _summary_to_dict(summary: OptimizationSummary) -> Dict[str, Any]:
    return {
        "total": summary.total,
        "finished": summary.finished,
        "running": summary.running,
        "throttled": summary.throttled,
        "topN": summary.top_n,
    }


def _to_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_datetime(value: Optional[Any]) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            try:
                return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                return None
    return None


def _to_iso(value: Optional[datetime]) -> str:
    if value is None:
        return iso_now()
    return value.replace(tzinfo=None).isoformat()


def _dict_to_policy(data: Optional[Dict[str, Any]]) -> Optional[EarlyStopPolicy]:
    if not data:
        return None
    try:
        metric = str(data.get("metric", ""))
        threshold_raw = data.get("threshold", 0.0)
        threshold = float(threshold_raw) if threshold_raw is not None else 0.0
        mode = str(data.get("mode", "min"))
        return EarlyStopPolicy(metric=metric, threshold=threshold, mode=mode)
    except Exception:  # pragma: no cover - defensive guard against malformed data
        return None


class TaskPersistence:
    """Optional persistence layer backed by SQLAlchemy.

    When a valid DSN is provided via OPTIMIZATION_DB_DSN (or explicitly through
    `configure_persistence`), job/task state is mirrored to the relational
    tables so the orchestrator can recover after a restart.
    """

    def __init__(self, dsn: Optional[str], *, create_tables: bool = False) -> None:
        clean_dsn = (dsn or os.getenv("OPTIMIZATION_DB_DSN") or "").strip()
        self.dsn = clean_dsn or None
        self.enabled = bool(self.dsn and create_engine is not None and _JOBS_TABLE is not None)
        self._engine: Optional[Engine] = None
        if not self.enabled:
            return
        self._engine = create_engine(self.dsn, future=True)
        if create_tables or self._is_sqlite():
            assert _METADATA is not None
            _METADATA.create_all(self._engine)

    def _is_sqlite(self) -> bool:
        return bool(self.dsn and self.dsn.lower().startswith("sqlite"))

    def persist_job(self, job: OptimizationJob, tasks: Sequence[OptimizationTask]) -> None:
        if not self.enabled or not self._engine:
            return
        summary_payload = _summary_to_dict(job.summary)
        policy_payload = _policy_to_dict(job.early_stop_policy)
        created_at = _to_datetime(job.created_at)
        updated_at = _to_datetime(job.updated_at)
        rows = [
            {
                "id": task.id,
                "job_id": task.job_id,
                "owner_id": task.owner_id,
                "strategy_version_id": task.version_id,
                "param_set": task.params,
                "status": task.status,
                "progress": task.progress,
                "retries": task.retries,
                "next_run_at": task.next_run_at,
                "throttled": task.throttled,
                "error": task.error,
                "last_error": task.last_error,
                "result_summary_id": task.result_summary_id,
                "score": task.score,
                "created_at": _to_datetime(task.created_at),
                "updated_at": _to_datetime(task.updated_at),
            }
            for task in tasks
        ]
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    insert(_JOBS_TABLE),
                    [
                        {
                            "id": job.id,
                            "owner_id": job.owner_id,
                            "strategy_version_id": job.version_id,
                            "param_space": job.param_space,
                            "concurrency_limit": job.concurrency_limit,
                            "early_stop_policy": policy_payload,
                            "status": job.status,
                            "total_tasks": job.total_tasks,
                            "estimate": job.estimate or job.total_tasks,
                            "summary": summary_payload,
                            "result_summary_id": None,
                            "created_at": created_at,
                            "updated_at": updated_at,
                        }
                    ],
                )
                if rows:
                    conn.execute(insert(_TASKS_TABLE), rows)
        except SQLAlchemyError:  # pragma: no cover - defensive fallback
            # In persistence failures we prefer to keep in-memory state working.
            pass

    def update_task(self, task: OptimizationTask) -> None:
        if not self.enabled or not self._engine:
            return
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    update(_TASKS_TABLE)
                    .where(_TASKS_TABLE.c.id == task.id)
                    .values(
                        status=task.status,
                        progress=task.progress,
                        retries=task.retries,
                        next_run_at=task.next_run_at,
                        throttled=task.throttled,
                        error=task.error,
                        last_error=task.last_error,
                        result_summary_id=task.result_summary_id,
                        score=task.score,
                        updated_at=_to_datetime(task.updated_at),
                    )
                )
        except SQLAlchemyError:  # pragma: no cover - defensive fallback
            pass

    def update_job(self, job: OptimizationJob) -> None:
        if not self.enabled or not self._engine:
            return
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    update(_JOBS_TABLE)
                    .where(_JOBS_TABLE.c.id == job.id)
                    .values(
                        status=job.status,
                        total_tasks=job.total_tasks,
                        estimate=job.estimate,
                        summary=_summary_to_dict(job.summary),
                        updated_at=_to_datetime(job.updated_at),
                    )
                )
        except SQLAlchemyError:  # pragma: no cover - defensive fallback
            pass

    def hydrate(self) -> None:
        if not self.enabled or not self._engine:
            return
        try:
            with self._engine.begin() as conn:
                job_rows = conn.execute(
                    select(_JOBS_TABLE).order_by(_JOBS_TABLE.c.created_at.nullslast())
                ).all()
                job_ids = [row._mapping["id"] for row in job_rows]
                task_rows: List[Any] = []
                if job_ids:
                    task_rows = conn.execute(
                        select(_TASKS_TABLE)
                        .where(_TASKS_TABLE.c.job_id.in_(job_ids))
                        .order_by(_TASKS_TABLE.c.created_at.nullslast(), _TASKS_TABLE.c.id)
                    ).all()
        except SQLAlchemyError:  # pragma: no cover - defensive fallback
            return

        job_map: Dict[str, List[Any]] = {job_id: [] for job_id in job_ids}
        for row in task_rows:
            job_map[row._mapping["job_id"]].append(row)

        _clear_memory()
        with _STORE_LOCK:
            for job_row in job_rows:
                job = self._row_to_job(job_row)
                tasks = {}
                order: List[str] = []
                for task_row in job_map.get(job.id, []):
                    task = self._row_to_task(task_row)
                    tasks[task.id] = task
                    order.append(task.id)
                _JOBS[job.id] = job
                _TASKS[job.id] = tasks
                _TASK_ORDER[job.id] = order
                if job.id not in _JOB_ORDER:
                    _JOB_ORDER.append(job.id)
                _refresh_summary(job, persist=False)

    def reset(self) -> None:
        if not self.enabled or not self._engine:
            return
        try:
            with self._engine.begin() as conn:
                conn.execute(_TASKS_TABLE.delete())
                conn.execute(_JOBS_TABLE.delete())
        except SQLAlchemyError:  # pragma: no cover - defensive fallback
            pass

    @staticmethod
    def _row_to_job(row: Any) -> OptimizationJob:
        mapping = row._mapping
        job = OptimizationJob(
            id=mapping["id"],
            owner_id=mapping["owner_id"],
            version_id=mapping["strategy_version_id"],
            param_space=mapping.get("param_space") or {},
            normalized_space={},
            concurrency_limit=mapping.get("concurrency_limit") or 0,
            early_stop_policy=_dict_to_policy(mapping.get("early_stop_policy")),
            status=mapping.get("status") or DEFAULT_STATUS,
            total_tasks=mapping.get("total_tasks") or 0,
            estimate=mapping.get("estimate") or mapping.get("total_tasks") or 0,
        )
        job.created_at = _to_iso(mapping.get("created_at"))
        job.updated_at = _to_iso(mapping.get("updated_at"))
        summary = mapping.get("summary") or {}
        if isinstance(summary, dict):
            job.summary = OptimizationSummary(
                total=int(summary.get("total", job.total_tasks or 0)),
                finished=int(summary.get("finished", 0)),
                running=int(summary.get("running", 0)),
                throttled=int(summary.get("throttled", 0)),
                top_n=list(summary.get("topN", [])),
            )
        else:
            job.summary = OptimizationSummary(job.total_tasks, 0, 0, 0)
        return job

    @staticmethod
    def _row_to_task(row: Any) -> OptimizationTask:
        mapping = row._mapping
        return OptimizationTask(
            id=mapping["id"],
            job_id=mapping["job_id"],
            owner_id=mapping["owner_id"],
            version_id=mapping["strategy_version_id"],
            params=mapping.get("param_set") or {},
            status=mapping.get("status") or DEFAULT_STATUS,
            progress=mapping.get("progress"),
            retries=mapping.get("retries") or 0,
            error=mapping.get("error"),
            result_summary_id=mapping.get("result_summary_id"),
            score=mapping.get("score"),
            throttled=bool(mapping.get("throttled")),
            next_run_at=mapping.get("next_run_at") or datetime.utcnow(),
            last_error=mapping.get("last_error"),
            created_at=_to_iso(mapping.get("created_at")),
            updated_at=_to_iso(mapping.get("updated_at")),
        )


_PERSISTENCE: TaskPersistence = TaskPersistence(None)
if _PERSISTENCE.enabled:
    _PERSISTENCE.hydrate()


def configure_persistence(dsn: Optional[str], *, create_tables: bool = False) -> None:
    """Configure persistence backend (used by tests to switch stores)."""

    global _PERSISTENCE
    _PERSISTENCE = TaskPersistence(dsn, create_tables=create_tables)
    if _PERSISTENCE.enabled:
        _PERSISTENCE.hydrate()
    else:
        _clear_memory()


def get_persistence() -> TaskPersistence:
    return _PERSISTENCE


# ==== Debug helpers ====

def debug_reset():
    _clear_memory()


def debug_reset_persistent():
    """Test helper to clear both memory cache and persistent storage."""

    _clear_memory()
    if _PERSISTENCE.enabled:
        _PERSISTENCE.reset()


def debug_jobs() -> Dict[str, OptimizationJob]:
    with _STORE_LOCK:
        return dict(_JOBS)


def debug_tasks(job_id: str) -> List[OptimizationTask]:
    with _STORE_LOCK:
        tasks = _TASKS.get(job_id, {})
        return list(tasks.values())
