import os
import threading
from datetime import datetime, timedelta

import pytest

from services.backtest.app.orchestrator import (
    JobAccessError,
    ParamInvalidError,
    cancel_job,
    configure_persistence,
    create_optimization_job,
    debug_jobs,
    debug_reset,
    debug_reset_persistent,
    debug_tasks,
    dequeue_next,
    get_job_status,
    get_job_snapshot,
    export_top_n_bundle,
    mark_task_failed,
    mark_task_succeeded,
    list_jobs,
)


@pytest.fixture(autouse=True)
def cleanup_env():
    prev_limit = os.environ.get("OPT_PARAM_SPACE_MAX")
    prev_concurrency = os.environ.get("OPT_CONCURRENCY_LIMIT_MAX")
    prev_top_n = os.environ.get("OPT_TOP_N_LIMIT")
    prev_max_retries = os.environ.get("OPT_MAX_RETRIES")
    os.environ["OPT_PARAM_SPACE_MAX"] = "32"
    os.environ["OPT_CONCURRENCY_LIMIT_MAX"] = "8"
    os.environ["OPT_TOP_N_LIMIT"] = "3"
    os.environ["OPT_MAX_RETRIES"] = "3"
    configure_persistence(None)
    debug_reset()
    yield
    debug_reset()
    configure_persistence(None)
    if prev_limit is None:
        os.environ.pop("OPT_PARAM_SPACE_MAX", None)
    else:
        os.environ["OPT_PARAM_SPACE_MAX"] = prev_limit
    if prev_concurrency is None:
        os.environ.pop("OPT_CONCURRENCY_LIMIT_MAX", None)
    else:
        os.environ["OPT_CONCURRENCY_LIMIT_MAX"] = prev_concurrency
    if prev_top_n is None:
        os.environ.pop("OPT_TOP_N_LIMIT", None)
    else:
        os.environ["OPT_TOP_N_LIMIT"] = prev_top_n
    if prev_max_retries is None:
        os.environ.pop("OPT_MAX_RETRIES", None)
    else:
        os.environ["OPT_MAX_RETRIES"] = prev_max_retries


def test_create_job_initializes_summary_and_tasks(monkeypatch):
    captured_metrics = []

    def fake_metric(name, value, tags=None):
        captured_metrics.append((name, value, tags))

    monkeypatch.setattr("services.backtest.app.orchestrator.emit_metric", fake_metric)
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={
            "ma_short": [5, 10],
            "ma_long": {"start": 20, "end": 30, "step": 5},
        },
        concurrency_limit=2,
        early_stop_policy={"metric": "sharpe", "threshold": 1.2, "mode": "max"},
    )
    assert result["status"] == "queued"
    jobs = list(debug_jobs().values())
    assert len(jobs) == 1
    job = jobs[0]
    assert job.total_tasks == 6
    assert job.summary.total == 6
    assert job.summary.running == 0
    assert job.summary.throttled == 4
    assert job.summary.top_n == []
    assert job.early_stop_policy.metric == "sharpe"
    tasks = debug_tasks(job.id)
    assert len(tasks) == 6
    ready = [task for task in tasks if not task.throttled]
    assert len(ready) == 2
    throttled = [task for task in tasks if task.throttled]
    assert len(throttled) == 4
    assert any(name == "throttled_requests" and value == 4 for name, value, _ in captured_metrics)


def test_mark_task_succeeded_records_result_summary():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1]},
        concurrency_limit=1,
    )
    job_id = result["id"]
    task = dequeue_next("owner-1", job_id)
    payload = mark_task_succeeded(
        job_id,
        task["id"],
        score=0.75,
        result_summary_id="summary-123",
    )
    assert payload["resultSummaryId"] == "summary-123"
    stored = debug_tasks(job_id)[0]
    assert stored.result_summary_id == "summary-123"


def test_create_job_respects_param_limit():
    os.environ["OPT_PARAM_SPACE_MAX"] = "3"
    with pytest.raises(ParamInvalidError):
        create_optimization_job(
            owner_id="owner-1",
            version_id="v-1",
            param_space={"p1": [1, 2], "p2": [3, 4]},
            concurrency_limit=1,
        )


def test_dequeue_and_concurrency_gate():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3, 4]},
        concurrency_limit=2,
    )
    job_id = result["id"]
    first = dequeue_next("owner-1", job_id)
    second = dequeue_next("owner-1", job_id)
    third = dequeue_next("owner-1", job_id)
    assert first["status"] == "running"
    assert second["status"] == "running"
    assert third is None  # concurrency gate holds

    mark_task_succeeded(job_id, first["id"], score=1.5)
    next_task = dequeue_next("owner-1", job_id)
    assert next_task is not None
    assert next_task["id"] != first["id"]
    status = get_job_status(job_id, "owner-1")
    assert status["summary"]["running"] == 2  # one finished, one running, one newly dispatched
    assert status["summary"]["throttled"] == 1


def test_queue_depth_reflects_throttled_when_capacity_full():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3, 4]},
        concurrency_limit=2,
    )
    job_id = result["id"]
    first = dequeue_next("owner-1", job_id)
    second = dequeue_next("owner-1", job_id)
    assert first is not None
    assert second is not None

    status = get_job_status(job_id, "owner-1")
    assert status["summary"]["running"] == 2
    assert status["summary"]["throttled"] == 2
    assert status["diagnostics"]["queueDepth"] == 2


def test_mark_task_failed_applies_retry_backoff():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2]},
        concurrency_limit=1,
    )
    job_id = result["id"]
    task = dequeue_next("owner-1", job_id)
    before = datetime.utcnow()
    failed = mark_task_failed(job_id, task["id"], error_type="UPSTREAM_ERROR", message="timeout")
    after = datetime.utcnow()
    assert failed["status"] == "queued"
    assert failed["retries"] == 1
    next_run = datetime.fromisoformat(failed["nextRunAt"])
    assert before + timedelta(seconds=2) <= next_run <= after + timedelta(seconds=3)
    # still in backoff window
    maybe_next = dequeue_next("owner-1", job_id)
    if maybe_next is not None:
        assert maybe_next["id"] != task["id"]
        mark_task_succeeded(job_id, maybe_next["id"], score=0.3)

    # Fast-forward original task and ensure it can be retried later
    for stored_task in debug_tasks(job_id):
        if stored_task.id == task["id"]:
            stored_task.next_run_at = datetime.utcnow() - timedelta(seconds=1)
            break
    retry_task = dequeue_next("owner-1", job_id)
    assert retry_task is not None
    assert retry_task["id"] == task["id"]
    failed_again = mark_task_failed(job_id, task["id"], error_type="UPSTREAM_ERROR", message="timeout")
    assert failed_again["retries"] == 2


def test_summary_topn_includes_result_summary_id():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1]},
        concurrency_limit=1,
    )
    job_id = result["id"]
    task = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, task["id"], score=0.42, result_summary_id="summary-abc")
    snapshot = get_job_status(job_id, "owner-1")
    topn = snapshot["summary"]["topN"]
    assert topn
    assert topn[0]["resultSummaryId"] == "summary-abc"


def test_export_top_n_bundle_contains_artifacts():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3]},
        concurrency_limit=3,
    )
    job_id = result["id"]
    tasks = debug_tasks(job_id)
    for index, task in enumerate(tasks[:2]):
        mark_task_succeeded(
            job_id,
            task.id,
            score=1.0 - index * 0.1,
            result_summary_id=f"summary-{index}",
        )
    bundle = export_top_n_bundle(job_id, "owner-1")
    assert bundle["jobId"] == job_id
    assert bundle["items"]
    first = bundle["items"][0]
    assert first["resultSummaryId"].startswith("summary-")
    assert first["artifacts"][0]["type"] == "metrics"
    assert "score" in first["metrics"]


def test_get_job_snapshot_reports_source_job():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2]},
        concurrency_limit=2,
        source_job_id="original-123",
    )
    job_id = result["id"]
    snapshot = get_job_snapshot(job_id, "owner-1")
    assert snapshot["id"] == job_id
    assert snapshot["sourceJobId"] == "original-123"
    assert snapshot["paramSpace"] == {"x": [1, 2]}


def test_list_jobs_orders_by_updated_and_includes_summary():
    first = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2]},
        concurrency_limit=1,
    )
    second = create_optimization_job(
        owner_id="owner-1",
        version_id="v-2",
        param_space={"y": [3]},
        concurrency_limit=1,
        source_job_id="src-1",
    )
    task = dequeue_next("owner-1", second["id"])
    mark_task_succeeded(second["id"], task["id"], score=1.3)

    history = list_jobs("owner-1", limit=10)
    assert history
    assert [entry["id"] for entry in history[:2]] == [second["id"], first["id"]]
    newest = history[0]
    assert newest["summary"]["finished"] >= 1
    assert newest["sourceJobId"] == "src-1"
    assert newest["paramSpace"] == {"y": [3]}


def test_list_jobs_filters_by_owner_and_applies_limit():
    create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1]},
        concurrency_limit=1,
    )
    other = create_optimization_job(
        owner_id="owner-2",
        version_id="v-2",
        param_space={"y": [2]},
        concurrency_limit=1,
    )
    limited = list_jobs("owner-1", limit=0)
    assert len(limited) == 1
    assert limited[0]["ownerId"] == "owner-1"
    foreign = list_jobs("owner-2", limit=5)
    assert len(foreign) == 1
    assert foreign[0]["id"] == other["id"]


def test_param_error_marks_failed_and_counts_finished():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1]},
        concurrency_limit=1,
    )
    job_id = result["id"]
    task = dequeue_next("owner-1", job_id)
    failed = mark_task_failed(job_id, task["id"], error_type="PARAM_ERROR", message="bad params")
    assert failed["status"] == "failed"
    status = get_job_status(job_id, "owner-1")
    assert status["summary"]["finished"] == 1
    assert status["status"] == "failed"


def test_top_n_updates_on_completion():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3]},
        concurrency_limit=2,
    )
    job_id = result["id"]
    t1 = dequeue_next("owner-1", job_id)
    t2 = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, t1["id"], score=0.9)
    mark_task_succeeded(job_id, t2["id"], score=1.2)
    # dispatch third task
    t3 = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, t3["id"], score=0.5)
    status = get_job_status(job_id, "owner-1")
    top_n = status["summary"]["topN"]
    assert [entry["score"] for entry in top_n] == [1.2, 0.9, 0.5]


def test_top_n_respects_min_mode():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3]},
        concurrency_limit=2,
        early_stop_policy={"metric": "loss", "threshold": 0.1, "mode": "min"},
    )
    job_id = result["id"]
    first = dequeue_next("owner-1", job_id)
    second = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, first["id"], score=0.42)
    mark_task_succeeded(job_id, second["id"], score=0.18)
    third = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, third["id"], score=0.36)
    status = get_job_status(job_id, "owner-1")
    top_scores = [entry["score"] for entry in status["summary"]["topN"]]
    assert top_scores == [0.18, 0.36, 0.42]


def test_early_stop_triggers_job_lock():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3]},
        concurrency_limit=1,
        early_stop_policy={"metric": "sharpe", "threshold": 1.0, "mode": "max"},
    )
    job_id = result["id"]
    first = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, first["id"], score=1.05)

    status = get_job_status(job_id, "owner-1")
    assert status["status"] == "early-stopped"
    assert status["diagnostics"].get("final") is True
    reason = status["diagnostics"].get("stopReason")
    assert reason and reason.get("kind") == "EARLY_STOP_THRESHOLD"
    assert reason.get("threshold") == 1.0

    # Ensure no additional tasks dispatched after early stop
    assert dequeue_next("owner-1", job_id) is None
    stored_tasks = debug_tasks(job_id)
    assert all(task.status in {"succeeded", "early-stopped"} for task in stored_tasks)


def test_early_stop_emits_metrics_and_logs(monkeypatch):
    captured_metrics = []
    captured_logs = []

    monkeypatch.setattr(
        "services.backtest.app.orchestrator.emit_metric",
        lambda name, value, tags=None: captured_metrics.append((name, value, tags)),
    )
    monkeypatch.setattr(
        "services.backtest.app.orchestrator.log_stop",
        lambda job_id, owner_id, status, reason=None: captured_logs.append((job_id, owner_id, status, reason)),
    )

    job = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2]},
        concurrency_limit=1,
        early_stop_policy={"metric": "sharpe", "threshold": 1.0, "mode": "max"},
    )
    job_id = job["id"]
    task = dequeue_next("owner-1", job_id)
    mark_task_succeeded(job_id, task["id"], score=1.2)

    stop_metrics = [m for m in captured_metrics if m[0] == "job_stop_total"]
    assert stop_metrics, "job_stop_total 应在早停时记录"
    name, value, tags = stop_metrics[-1]
    assert value == 1.0
    assert tags["status"] == "early-stopped"
    assert tags["stopKind"] == "EARLY_STOP_THRESHOLD"
    assert tags["jobId"] == job_id

    threshold_metrics = [m for m in captured_metrics if m[0] == "job_stop_threshold"]
    assert threshold_metrics and threshold_metrics[-1][1] == 1.0
    score_metrics = [m for m in captured_metrics if m[0] == "job_stop_score"]
    assert score_metrics and score_metrics[-1][1] == 1.2

    assert captured_logs, "早停应产生结构化 stop 日志"
    logged_job_id, logged_owner, logged_status, reason = captured_logs[-1]
    assert logged_job_id == job_id
    assert logged_owner == "owner-1"
    assert logged_status == "early-stopped"
    assert reason and reason.get("kind") == "EARLY_STOP_THRESHOLD"


def test_get_job_status_enforces_owner():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1]},
        concurrency_limit=1,
    )
    job_id = result["id"]
    with pytest.raises(JobAccessError) as exc:
        get_job_status(job_id, "other")
    assert exc.value.code == "E.FORBIDDEN"


def test_thread_safe_dequeue_and_update(monkeypatch):
    monkeypatch.setenv("OPT_PARAM_SPACE_MAX", "32")
    job = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2, 3]},
        concurrency_limit=2,
    )
    job_id = job["id"]

    results = []

    def fetch():
        task = dequeue_next("owner-1", job_id)
        results.append(task)

    threads = [threading.Thread(target=fetch) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    returned_ids = {task["id"] for task in results if task}
    assert len(returned_ids) == 2

    for task in results:
        if task:
            mark_task_succeeded(job_id, task["id"], score=1.0)

    status = get_job_status(job_id, "owner-1")
    assert status["summary"]["finished"] >= 2


def test_sqlite_persistence_round_trip(tmp_path):
    pytest.importorskip("sqlalchemy")
    dsn = f"sqlite:///{tmp_path/'opt_persist.sqlite'}"
    configure_persistence(dsn, create_tables=True)
    try:
        result = create_optimization_job(
            owner_id="owner-1",
            version_id="v-1",
            param_space={"x": [1, 2]},
            concurrency_limit=1,
        )
        job_id = result["id"]
        first = dequeue_next("owner-1", job_id)
        assert first is not None
        mark_task_succeeded(job_id, first["id"], score=0.8)

        # Simulate process restart: reconfigure persistence, which rehydrates memory
        configure_persistence(dsn, create_tables=False)
        status = get_job_status(job_id, "owner-1")
        assert status["summary"]["total"] == 2
        assert status["summary"]["finished"] == 1

        # Ensure queued work can still be fetched after hydration
        next_task = dequeue_next("owner-1", job_id)
        assert next_task is not None
        assert next_task["id"] != first["id"]
    finally:
        debug_reset_persistent()
        configure_persistence(None)


def test_cancel_job_updates_tasks_and_summary():
    result = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2]},
        concurrency_limit=1,
    )
    job_id = result["id"]
    task = dequeue_next("owner-1", job_id)
    assert task is not None
    payload = cancel_job(job_id, "owner-1", reason="user-request")
    assert payload["status"] == "canceled"
    assert payload["diagnostics"].get("final") is True
    reason = payload["diagnostics"].get("stopReason")
    assert reason and reason.get("kind") == "CANCELED"
    assert reason.get("reason") == "user-request"

    # cancel should prevent further dispatch
    assert dequeue_next("owner-1", job_id) is None
    statuses = {task.status for task in debug_tasks(job_id)}
    assert statuses <= {"canceled", "succeeded", "failed"}


def test_cancel_job_emits_metrics_and_logs(monkeypatch):
    captured_metrics = []
    captured_logs = []

    monkeypatch.setattr(
        "services.backtest.app.orchestrator.emit_metric",
        lambda name, value, tags=None: captured_metrics.append((name, value, tags)),
    )
    monkeypatch.setattr(
        "services.backtest.app.orchestrator.log_stop",
        lambda job_id, owner_id, status, reason=None: captured_logs.append((job_id, owner_id, status, reason)),
    )

    job = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"x": [1, 2]},
        concurrency_limit=1,
    )
    job_id = job["id"]
    cancel_job(job_id, "owner-1", reason="manual-stop")

    stop_metrics = [m for m in captured_metrics if m[0] == "job_stop_total"]
    assert stop_metrics, "job_stop_total 应在取消时记录"
    _, value, tags = stop_metrics[-1]
    assert value == 1.0
    assert tags["status"] == "canceled"
    assert tags["stopKind"] == "CANCELED"
    assert tags["jobId"] == job_id

    # 取消不应输出阈值或分数指标
    assert not [m for m in captured_metrics if m[0] == "job_stop_threshold"]
    assert not [m for m in captured_metrics if m[0] == "job_stop_score"]

    assert captured_logs, "取消应产生结构化 stop 日志"
    logged_job_id, logged_owner, logged_status, reason = captured_logs[-1]
    assert logged_job_id == job_id
    assert logged_owner == "owner-1"
    assert logged_status == "canceled"
    assert reason and reason.get("kind") == "CANCELED"
