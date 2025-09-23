from datetime import datetime, timedelta

import pytest

from services.backtest.app import worker
from services.backtest.app.orchestrator import (
    create_optimization_job,
    debug_reset,
    debug_tasks,
)


@pytest.fixture(autouse=True)
def reset_state():
    debug_reset()
    yield
    debug_reset()


def capture_metrics(monkeypatch):
    metrics = []

    def fake_metric(name, value, tags=None):
        metrics.append((name, value, tags))

    monkeypatch.setattr("services.backtest.app.worker.emit_metric", fake_metric)
    return metrics


def test_worker_process_success(monkeypatch):
    metrics = capture_metrics(monkeypatch)
    job = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"alpha": [1, 2]},
        concurrency_limit=1,
    )

    def runner(task):
        return sum(v for v in task["params"].values() if isinstance(v, (int, float)))

    result = worker.process_next("owner-1", runner)
    assert result["status"] == "succeeded"
    assert result["score"] == pytest.approx(1.0, abs=0.01)

    names = [name for name, _, _ in metrics]
    assert "queue_wait_seconds" in names
    assert "active_jobs" in names


def test_worker_process_param_error(monkeypatch):
    metrics = capture_metrics(monkeypatch)
    job = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"alpha": [1]},
        concurrency_limit=1,
    )

    def runner(_task):
        raise worker.WorkerError("bad params", kind="param")

    outcome = worker.process_next("owner-1", runner)
    assert outcome["status"] == "failed"
    assert outcome["error"] == "PARAM_ERROR"
    # Ensure metrics still emitted for failure path
    names = [name for name, _, _ in metrics]
    assert "queue_wait_seconds" in names
    assert "active_jobs" in names


def test_worker_retry_then_success(monkeypatch):
    metrics = capture_metrics(monkeypatch)
    job = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"alpha": [1]},
        concurrency_limit=1,
    )
    job_id = job["id"]

    calls = {"count": 0}

    def flaky_runner(task):
        if calls["count"] == 0:
            calls["count"] += 1
            raise worker.WorkerError("upstream timeout", kind="upstream")
        return 42

    first = worker.process_next("owner-1", flaky_runner)
    assert first["status"] == "failed"
    assert first["error"] == "UPSTREAM_ERROR"

    task_obj = debug_tasks(job_id)[0]
    task_obj.next_run_at = datetime.utcnow() - timedelta(seconds=1)

    second = worker.process_next("owner-1", flaky_runner)
    assert second["status"] == "succeeded"
    assert pytest.approx(second["score"], 0.01) == 42.0

    # Verify queue metric emitted at least twice (failure + success)
    queue_metrics = [m for m in metrics if m[0] == "queue_wait_seconds"]
    assert len(queue_metrics) >= 2
