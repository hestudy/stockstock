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
    orchestrator.debug_reset()
    if prev_limit is None:
        os.environ["OPT_PARAM_SPACE_MAX"] = "16"
    yield
    orchestrator.debug_reset()
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
