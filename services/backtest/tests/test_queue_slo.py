import os
import time
from math import ceil, floor
from typing import Dict, List

import pytest

from services.backtest.app import orchestrator
from services.backtest.app.worker import process_next


@pytest.fixture(autouse=True)
def configure_environment():
    prev: Dict[str, str | None] = {}
    keys = [
        "OPT_PARAM_SPACE_MAX",
        "OPT_CONCURRENCY_LIMIT_MAX",
        "OPT_MAX_RETRIES",
        "OPT_TOP_N_LIMIT",
    ]
    for key in keys:
        prev[key] = os.environ.get(key)
    os.environ["OPT_PARAM_SPACE_MAX"] = "64"
    os.environ["OPT_CONCURRENCY_LIMIT_MAX"] = "8"
    os.environ["OPT_MAX_RETRIES"] = "3"
    os.environ["OPT_TOP_N_LIMIT"] = "5"
    orchestrator.debug_reset()
    yield
    orchestrator.debug_reset()
    for key, value in prev.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


@pytest.fixture
def metric_capture(monkeypatch):
    recorded: Dict[str, List[float]] = {"queue_wait_seconds": []}

    def capture_metric(name: str, value: float, *, tags=None):
        if name == "queue_wait_seconds":
            recorded.setdefault(name, []).append(float(value))

    monkeypatch.setattr("services.backtest.app.worker.emit_metric", capture_metric)
    monkeypatch.setattr("services.backtest.app.orchestrator.emit_metric", lambda *a, **k: None)
    return recorded


def test_queue_wait_p95_within_two_minutes(metric_capture):
    owner_id = "owner-slo"
    job = orchestrator.create_optimization_job(
        owner_id=owner_id,
        version_id="ver-slo",
        param_space={
            "ma_short": [5, 10, 15, 20],
            "ma_long": {"start": 30, "end": 38, "step": 4},
        },
        concurrency_limit=3,
    )

    total = job["totalTasks"]
    processed = 0
    deadline = time.time() + 10

    def runner(_: dict) -> float:
        # 模拟计算开销，防止所有任务瞬间结束导致队列指标空洞
        time.sleep(0.01)
        return 1.0

    while True:
        outcome = process_next(owner_id, runner)
        if outcome is None:
            status = orchestrator.get_job_status(job["id"], owner_id)
            if status["summary"]["finished"] >= total:
                break
            assert time.time() < deadline, "queue processing exceeded safety timeout"
            time.sleep(0.01)
            continue
        processed += 1

    waits = metric_capture.get("queue_wait_seconds", [])
    assert len(waits) == processed, "每个完成的任务都应记录 queue_wait_seconds 指标"

    p95 = percentile(waits, 95)
    assert p95 <= 120.0, f"Queue wait P95 {p95:.2f}s 超过 120s SLO"

    # 双重保险：最大等待时间也应满足阈值
    assert max(waits) <= 120.0


def percentile(values: List[float], percent: float) -> float:
    if not values:
        raise ValueError("values must not be empty")
    ordered = sorted(values)
    k = (percent / 100.0) * (len(ordered) - 1)
    lower = floor(k)
    upper = ceil(k)
    if lower == upper:
        return ordered[int(k)]
    fraction = k - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction
