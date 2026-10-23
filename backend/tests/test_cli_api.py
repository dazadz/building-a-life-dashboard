import io
import json
import sys
import time

import pytest
from fastapi.testclient import TestClient

from samuel import cli, coach, db
from samuel.api import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def run_cli(args, capsys, stdin=None, monkeypatch=None):
    if stdin is not None:
        monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    cli.main(args)
    return capsys.readouterr().out


def test_export_and_report_round_trip(capsys, monkeypatch):
    run_cli(["demo", "--days", "10"], capsys)
    out = json.loads(run_cli(["export", "--since", "7d"], capsys))
    assert len(out["days"]) == 7
    assert out["days"][-2]["checkin"]["sleep_hours"] is not None
    assert out["days"][-1]["checkin"] is None  # demo leaves today empty

    said = run_cli(["report", "add", "--kind", "daily", "--file", "-"], capsys, "# Good day\nMore text", monkeypatch)
    assert "Saved daily report" in said
    assert "Good day" in run_cli(["report", "list"], capsys)


def test_demo_refuses_a_database_with_data(capsys):
    run_cli(["demo", "--days", "3"], capsys)
    with pytest.raises(SystemExit):
        cli.main(["demo"])


def test_checkin_api(client):
    r = client.put("/api/checkins/2026-10-20", json={"sleep_hours": 8, "energy": 10, "mood": "great"})
    assert r.status_code == 200
    body = r.json()
    assert body["checkin"]["energy"] == 10
    assert body["summary"]["scores"]["energy"] == 100
    assert {h["key"]: h["status"] for h in body["habits"]}["sleep_target"] == "done"


def test_checkin_api_validates(client):
    assert client.put("/api/checkins/2026-10-20", json={"energy": 11}).status_code == 422
    assert client.put("/api/checkins/2026-10-20", json={"wake_time": "7am"}).status_code == 422
    assert client.put("/api/checkins/not-a-date", json={}).status_code == 422


def test_habit_api(client):
    r = client.put("/api/habits/2026-10-20/reading", json={"status": "done"})
    assert {h["key"]: h["status"] for h in r.json()["habits"]}["reading"] == "done"
    assert client.put("/api/habits/2026-10-20/nope", json={"status": "done"}).status_code == 404


def test_coach_needs_claude(client, monkeypatch):
    monkeypatch.setattr(coach, "claude_path", lambda: None)
    assert client.get("/api/status").json()["coach"]["installed"] is False
    assert client.post("/api/coach/run", json={}).status_code == 503


def test_coach_job_runs_and_finds_the_report(client, monkeypatch, tmp_path):
    # A stand-in for Claude Code that writes a report through the samuel CLI, as the skill does.
    fake = tmp_path / "fake_claude.py"
    fake.write_text(
        "from samuel import db, reports\n"
        "reports.add_report(db.connect(), 'daily', '# Daily report. All good')\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    monkeypatch.setattr(coach, "command", lambda skill: [sys.executable, str(fake)])

    job_id = client.post("/api/coach/run", json={"skill": "daily-report"}).json()["job_id"]
    for _ in range(100):
        job = client.get(f"/api/coach/jobs/{job_id}").json()
        if job["status"] != "running":
            break
        time.sleep(0.1)
    assert job["status"] == "done", job["error"]
    assert client.get("/api/reports").json()[0]["markdown"].startswith("# Daily report")


def test_coach_job_fails_without_a_report(client, monkeypatch):
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    monkeypatch.setattr(coach, "command", lambda skill: [sys.executable, "-c", "pass"])
    job_id = client.post("/api/coach/run", json={}).json()["job_id"]
    for _ in range(100):
        job = client.get(f"/api/coach/jobs/{job_id}").json()
        if job["status"] != "running":
            break
        time.sleep(0.1)
    assert job["status"] == "failed"
    assert "without saving a report" in job["error"]
