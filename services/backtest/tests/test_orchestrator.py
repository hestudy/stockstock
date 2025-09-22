import os
import pytest

from services.backtest.app.orchestrator import (
    ParamInvalidError,
    create_optimization_job,
    debug_jobs,
    debug_tasks,
    debug_reset,
)


@pytest.fixture(autouse=True)
def cleanup():
    prev = os.environ.get("OPT_PARAM_SPACE_MAX")
    prev_concurrency = os.environ.get("OPT_CONCURRENCY_LIMIT_MAX")
    os.environ["OPT_PARAM_SPACE_MAX"] = "16"
    debug_reset()
    yield
    debug_reset()
    if prev is None:
        os.environ.pop("OPT_PARAM_SPACE_MAX", None)
    else:
        os.environ["OPT_PARAM_SPACE_MAX"] = prev
    if prev_concurrency is None:
        os.environ.pop("OPT_CONCURRENCY_LIMIT_MAX", None)
    else:
        os.environ["OPT_CONCURRENCY_LIMIT_MAX"] = prev_concurrency


def test_create_optimization_job_records_state():
    payload = create_optimization_job(
        owner_id="owner-1",
        version_id="v-1",
        param_space={"ma_short": [5, 10], "ma_long": {"start": 20, "end": 30, "step": 10}},
        concurrency_limit=3,
        early_stop_policy={"metric": "sharpe", "threshold": 1.1, "mode": "max"},
        estimate=None,
    )
    assert payload["status"] == "queued"
    jobs = list(debug_jobs().values())
    assert len(jobs) == 1
    job = jobs[0]
    assert job.total_tasks == 4
    assert job.concurrency_limit == 3
    assert job.summary is None
    assert job.early_stop_policy is not None
    assert job.early_stop_policy.metric == "sharpe"
    assert job.early_stop_policy.threshold == pytest.approx(1.1)
    assert job.early_stop_policy.mode == "max"
    tasks = debug_tasks(job.id)
    assert len(tasks) == 4
    assert any(task.params["ma_short"] == 5 for task in tasks)
    first = tasks[0]
    assert first.owner_id == "owner-1"
    assert first.version_id == "v-1"
    assert first.status == "queued"
    assert first.retries == 0
    assert first.progress is None


def test_create_optimization_job_respects_limit():
    os.environ["OPT_PARAM_SPACE_MAX"] = "3"
    with pytest.raises(ParamInvalidError):
        create_optimization_job(
            owner_id="owner-1",
            version_id="v-1",
            param_space={"p1": [1, 2], "p2": [3, 4]},
            concurrency_limit=1,
            early_stop_policy=None,
            estimate=None,
        )


def test_concurrency_limit_exceeds_max():
    os.environ["OPT_CONCURRENCY_LIMIT_MAX"] = "4"
    with pytest.raises(ParamInvalidError):
        create_optimization_job(
            owner_id="owner-1",
            version_id="v-1",
            param_space={"p1": [1, 2], "p2": [3, 4]},
            concurrency_limit=8,
            early_stop_policy=None,
            estimate=None,
        )
