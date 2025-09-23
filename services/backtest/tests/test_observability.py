import json
from services.backtest.app import observability as obs


def test_log_error_emits_json(monkeypatch):
    events = []

    def fake_write(payload):
        events.append(payload)

    monkeypatch.setattr(obs, "_write", fake_write)
    monkeypatch.setenv("OBS_ENABLED", "true")

    obs.log_error("job-1", "owner-1", code="PARAM_ERROR", message="bad input", retry=1, extra={"k": "v"})

    assert events, "no log emitted"
    data = events[-1]
    assert data["level"] == "error"
    assert data["jobId"] == "job-1"
    assert data["ownerId"] == "owner-1"
    assert data["code"] == "PARAM_ERROR"
    assert data["phase"] == "error"
    assert data["extra"] == {"k": "v"}


def test_emit_metric_respects_toggle(monkeypatch):
    events = []

    def fake_write(payload):
        events.append(payload)

    monkeypatch.setattr(obs, "_write", fake_write)
    monkeypatch.setenv("OBS_METRICS_ENABLED", "true")
    obs.emit_metric("queue_wait_seconds", 1.5, tags={"jobId": "job-1"})
    assert events and events[-1]["name"] == "queue_wait_seconds"

    events.clear()
    monkeypatch.setenv("OBS_METRICS_ENABLED", "false")
    obs.emit_metric("queue_wait_seconds", 1.5, tags={"jobId": "job-1"})
    assert not events
