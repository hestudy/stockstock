"""Queue orchestration with concurrency control, retries, and summary aggregation."""

from __future__ import annotations

import itertools
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

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
    normalized_space: Dict[str, Sequence[Any]]
    concurrency_limit: int
    early_stop_policy: Optional[EarlyStopPolicy]
    status: JobStatus = DEFAULT_STATUS
    total_tasks: int = 0
    summary: OptimizationSummary = field(default_factory=lambda: OptimizationSummary(0, 0, 0, 0))
    created_at: str = field(default_factory=iso_now)
    updated_at: str = field(default_factory=iso_now)


_JOBS: Dict[str, OptimizationJob] = {}
_TASKS: Dict[str, Dict[str, OptimizationTask]] = {}
_TASK_ORDER: Dict[str, List[str]] = {}
_JOB_ORDER: List[str] = []


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
        summary=_initial_summary(total_tasks, tasks),
    )
    _JOBS[job_id] = job
    _TASKS[job_id] = {task.id: task for task in tasks}
    _TASK_ORDER[job_id] = [task.id for task in tasks]
    if job_id not in _JOB_ORDER:
        _JOB_ORDER.append(job_id)
    return {
        "id": job_id,
        "status": job.status,
        "throttled": job.summary.throttled > 0,
    }


def dequeue_next(owner_id: str, job_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    now = datetime.utcnow()
    job_ids = [job_id] if job_id else list(_JOB_ORDER)
    for jid in job_ids:
        job = _JOBS.get(jid)
        if not job or job.owner_id != owner_id:
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
                _refresh_summary(job)
                return _task_to_dict(task)
    return None


def mark_task_succeeded(job_id: str, task_id: str, score: Optional[float] = None) -> Dict[str, Any]:
    job, task = _get_job_and_task(job_id, task_id)
    task.status = "succeeded"
    task.score = score
    task.throttled = False
    task.progress = 1.0
    task.updated_at = iso_now()
    task.next_run_at = datetime.utcnow()
    task.error = None
    task.last_error = None
    _activate_slots(job)
    _refresh_summary(job)
    return _task_to_dict(task)


def mark_task_failed(
    job_id: str,
    task_id: str,
    *,
    error_type: str,
    message: str,
) -> Dict[str, Any]:
    job, task = _get_job_and_task(job_id, task_id)
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
    _activate_slots(job)
    _refresh_summary(job)
    return _task_to_dict(task)


def get_job_status(job_id: str, owner_id: str) -> Dict[str, Any]:
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
    summary = job.summary
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
            "topN": summary.top_n,
        },
        "diagnostics": {
            "throttled": summary.throttled > 0,
            "queueDepth": summary.throttled,
            "running": summary.running,
        },
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


def _refresh_summary(job: OptimizationJob) -> None:
    tasks = list(_TASKS[job.id].values())
    finished = sum(1 for task in tasks if task.status in FINISHED_STATUSES)
    running = sum(1 for task in tasks if task.status == "running")
    throttled = sum(1 for task in tasks if task.throttled)
    top_limit = get_top_n_limit()
    scored = [task for task in tasks if task.score is not None]
    scored.sort(key=lambda t: t.score if t.score is not None else float("-inf"), reverse=True)
    top_n = [{"taskId": task.id, "score": float(task.score)} for task in scored[:top_limit]]
    job.summary = OptimizationSummary(
        total=job.total_tasks,
        finished=finished,
        running=running,
        throttled=throttled,
        top_n=top_n,
    )
    job.updated_at = iso_now()
    if finished >= job.total_tasks:
        job.status = "succeeded"
        if any(task.status == "failed" for task in tasks):
            job.status = "failed"
    elif running > 0:
        job.status = "running"
    else:
        job.status = DEFAULT_STATUS


def _activate_slots(job: OptimizationJob) -> None:
    running = _count_status(job.id, "running")
    capacity = max(job.concurrency_limit - running, 0)
    if capacity <= 0:
        return
    now = datetime.utcnow()
    for task_id in _TASK_ORDER[job.id]:
        if capacity <= 0:
            break
        task = _TASKS[job.id][task_id]
        if task.status == "queued" and task.throttled:
            task.throttled = False
            task.next_run_at = min(task.next_run_at, now)
            task.updated_at = iso_now()
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


# ==== Debug helpers ====

def debug_reset():
    _JOBS.clear()
    _TASKS.clear()
    _TASK_ORDER.clear()
    _JOB_ORDER.clear()


def debug_jobs() -> Dict[str, OptimizationJob]:
    return _JOBS


def debug_tasks(job_id: str) -> List[OptimizationTask]:
    tasks = _TASKS.get(job_id, {})
    return list(tasks.values())
