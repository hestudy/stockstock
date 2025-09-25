import os

import pytest
from fastapi.testclient import TestClient

from services.backtest.app.main import app
from services.backtest.app import orchestrator

client = TestClient(app)


def payload(**overrides):
    body = {
        "ownerId": "owner-1",
        "versionId": "v-1",
        "paramSpace": {"x": [1, 2]},
        "concurrencyLimit": 2,
        "estimate": 2,
    }
    body.update(overrides)
    return body


@pytest.fixture(autouse=True)
def reset_state():
    prev_secret = os.environ.get("OPTIMIZATION_ORCHESTRATOR_SECRET")
    prev_limit = os.environ.get("OPT_PARAM_SPACE_MAX")
    orchestrator.configure_persistence(None)
    orchestrator.debug_reset()
    if prev_limit is None:
        os.environ["OPT_PARAM_SPACE_MAX"] = "16"
    yield
    orchestrator.debug_reset()
    orchestrator.configure_persistence(None)
    if prev_secret is None:
        os.environ.pop("OPTIMIZATION_ORCHESTRATOR_SECRET", None)
    if prev_limit is None:
        os.environ.pop("OPT_PARAM_SPACE_MAX", None)


def test_rejects_when_secret_missing_header():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    response = client.post("/internal/optimizations", json=payload())
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "E.FORBIDDEN"


def test_accepts_with_valid_secret_and_owner_header():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    response = client.post(
        "/internal/optimizations",
        json=payload(),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "queued"
    job_id = data["id"]

    status_resp = client.get(
        f"/internal/optimizations/{job_id}/status",
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    assert status_resp.status_code == 200
    status_payload = status_resp.json()
    assert status_payload["id"] == job_id
    assert status_payload["summary"]["total"] == 2
    assert status_payload["summary"]["running"] == 0
    assert status_payload["diagnostics"]["queueDepth"] >= 0


def test_rejects_on_owner_mismatch():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    response = client.post(
        "/internal/optimizations",
        json=payload(ownerId="owner-1"),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "other"},
    )
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "E.FORBIDDEN"
    assert detail["details"]["ownerId"] == "owner-1"


def test_status_requires_owner_header():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    create = client.post(
        "/internal/optimizations",
        json=payload(),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    job_id = create.json()["id"]
    resp = client.get(
        f"/internal/optimizations/{job_id}/status",
        headers={"x-opt-shared-secret": "secret"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "E.PARAM_INVALID"


def test_status_rejects_foreign_owner():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    create = client.post(
        "/internal/optimizations",
        json=payload(),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    job_id = create.json()["id"]
    status_resp = client.get(
        f"/internal/optimizations/{job_id}/status",
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "other"},
    )
    assert status_resp.status_code == 403
    assert status_resp.json()["detail"]["code"] == "E.FORBIDDEN"


def test_cancel_endpoint_marks_job_and_returns_reason():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    create = client.post(
        "/internal/optimizations",
        json=payload(),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    job_id = create.json()["id"]
    cancel_resp = client.post(
        f"/internal/optimizations/{job_id}/cancel",
        json={"reason": "manual"},
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    assert cancel_resp.status_code == 200
    body = cancel_resp.json()
    assert body["status"] == "canceled"
    assert body["diagnostics"]["final"] is True
    assert body["diagnostics"]["stopReason"]["kind"] == "CANCELED"
    assert body["diagnostics"]["stopReason"]["reason"] == "manual"

    # ensure unauthorized owner cannot cancel the same job
    forbidden = client.post(
        f"/internal/optimizations/{job_id}/cancel",
        json={},
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "other"},
    )
    assert forbidden.status_code == 403


def test_snapshot_endpoint_returns_source_job_id():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    create = client.post(
        "/internal/optimizations",
        json=payload(sourceJobId="origin-1"),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    job_id = create.json()["id"]
    resp = client.get(
        f"/internal/optimizations/{job_id}",
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == job_id
    assert body["sourceJobId"] == "origin-1"


def test_history_endpoint_returns_sorted_jobs():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    first = client.post(
        "/internal/optimizations",
        json=payload(),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    ).json()
    second = client.post(
        "/internal/optimizations",
        json=payload(sourceJobId="origin-2"),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    ).json()
    tasks = orchestrator.debug_tasks(second["id"])
    orchestrator.mark_task_succeeded(second["id"], tasks[0].id, score=1.1)

    resp = client.get(
        "/internal/optimizations?limit=1",
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    assert resp.status_code == 200
    jobs = resp.json()
    assert len(jobs) == 1
    newest = jobs[0]
    assert newest["id"] == second["id"]
    assert newest["summary"]["finished"] >= 1
    assert newest["sourceJobId"] == "origin-2"


def test_export_endpoint_returns_topn_bundle():
    os.environ["OPTIMIZATION_ORCHESTRATOR_SECRET"] = "secret"
    create = client.post(
        "/internal/optimizations",
        json=payload(),
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    job_id = create.json()["id"]
    tasks = orchestrator.debug_tasks(job_id)
    for idx, task in enumerate(tasks[:2]):
        orchestrator.mark_task_succeeded(
            job_id,
            task.id,
            score=1.0 - idx * 0.1,
            result_summary_id=f"summary-{idx}",
        )
    resp = client.post(
        f"/internal/optimizations/{job_id}/export",
        headers={"x-opt-shared-secret": "secret", "x-owner-id": "owner-1"},
    )
    assert resp.status_code == 200
    bundle = resp.json()
    assert bundle["jobId"] == job_id
    assert len(bundle["items"]) >= 1
    assert bundle["items"][0]["artifacts"][0]["type"] == "metrics"
