import os
from datetime import datetime, timedelta

import pytest

from services.backtest.app.orchestrator import (
    JobAccessError,
    ParamInvalidError,
    create_optimization_job,
    debug_jobs,
    debug_reset,
    debug_tasks,
    dequeue_next,
    get_job_status,
    mark_task_failed,
    mark_task_succeeded,
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
    debug_reset()
    yield
    debug_reset()
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


def test_create_job_initializes_summary_and_tasks():
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
    assert status["summary"]["throttled"] == 0


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
