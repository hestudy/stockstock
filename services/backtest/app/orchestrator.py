"""Simplified in-memory orchestrator for optimization jobs.

This module validates incoming optimization submissions, enforces
parameter-space limits, and records jobs for downstream workers.
"""

from __future__ import annotations

import itertools
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

JobStatus = str
DEFAULT_STATUS: JobStatus = "queued"
DEFAULT_LIMIT = 500
MAX_SAFE_PRODUCT = DEFAULT_LIMIT * 4


class ParamInvalidError(Exception):
    """Raised when the provided parameter space cannot be processed."""

    code = "E.PARAM_INVALID"
    status = 400

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.details = details or {}


@dataclass
class EarlyStopPolicy:
    metric: str
    threshold: float
    mode: str  # "min" | "max"


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
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass
class OptimizationTask:
    id: str
    job_id: str
    params: Dict[str, Any]
    status: JobStatus = DEFAULT_STATUS


_STORE: Dict[str, OptimizationJob] = {}
_TASKS: Dict[str, List[OptimizationTask]] = {}


def get_param_limit() -> int:
    raw = os.getenv("OPT_PARAM_SPACE_MAX")
    if not raw:
        return DEFAULT_LIMIT
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_LIMIT
    return max(1, value)


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


def expand_param_space(normalized: Dict[str, Sequence[Any]]) -> Iterable[Dict[str, Any]]:
    keys = list(normalized.keys())
    value_lists = [normalized[k] for k in keys]
    for combo in itertools.product(*value_lists):
        yield dict(zip(keys, combo))


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
    job_id = str(uuid.uuid4())
    policy = None
    if early_stop_policy:
        policy = EarlyStopPolicy(
            metric=str(early_stop_policy.get("metric", "")),
            threshold=float(early_stop_policy.get("threshold", 0.0)),
            mode=str(early_stop_policy.get("mode", "min")),
        )
    job = OptimizationJob(
        id=job_id,
        owner_id=owner_id,
        version_id=version_id,
        param_space=param_space,
        normalized_space=normalized,
        concurrency_limit=concurrency_limit,
        early_stop_policy=policy,
        total_tasks=computed_estimate,
    )
    _STORE[job_id] = job
    tasks = [
        OptimizationTask(id=str(uuid.uuid4()), job_id=job_id, params=params)
        for params in limited_tasks(normalized, computed_estimate)
    ]
    _TASKS[job_id] = tasks
    return {"id": job_id, "status": job.status}


def limited_tasks(normalized: Dict[str, Sequence[Any]], estimate: int) -> Iterable[Dict[str, Any]]:
    """Generate tasks but cap at 1k records to avoid memory explosion."""
    cap = min(estimate, 1000)
    iterator = expand_param_space(normalized)
    for idx, params in enumerate(iterator):
        if idx >= cap:
            break
        yield params


def debug_reset():
    _STORE.clear()
    _TASKS.clear()


def debug_jobs() -> Dict[str, OptimizationJob]:
    return _STORE


def debug_tasks(job_id: str) -> List[OptimizationTask]:
    return _TASKS.get(job_id, [])
