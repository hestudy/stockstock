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
    os.environ["OPT_PARAM_SPACE_MAX"] = "16"
    debug_reset()
    yield
    debug_reset()
    if prev is None:
        os.environ.pop("OPT_PARAM_SPACE_MAX", None)
    else:
        os.environ["OPT_PARAM_SPACE_MAX"] = prev


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
    tasks = debug_tasks(job.id)
    assert len(tasks) == 4
    assert any(task.params["ma_short"] == 5 for task in tasks)


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
