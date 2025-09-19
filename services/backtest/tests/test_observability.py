import json
from services.backtest.app import observability as obs

def test_log_error_emits_json(monkeypatch, capsys):
    events = []

    def fake_write(s):
        events.append(s)

    monkeypatch.setattr("sys.stdout.write", fake_write)

    obs.log_error("job-1", "owner-1", code="PARAM_ERROR", message="bad input", retry=1, extra={"k": "v"})

    assert events, "no log emitted"
    line = events[-1]
    data = json.loads(line)
    assert data["level"] == "error"
    assert data["jobId"] == "job-1"
    assert data["ownerId"] == "owner-1"
    assert data["code"] == "PARAM_ERROR"
    assert data["phase"] == "error"
    assert data["extra"] == {"k": "v"}
