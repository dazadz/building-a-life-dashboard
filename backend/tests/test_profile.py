import pytest
from fastapi.testclient import TestClient

from samuel import backups, coach, profile
from samuel.api import create_app
from samuel.reports import export


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def test_there_are_45_questions_in_4_sections():
    assert [len(s["questions"]) for s in profile.SECTIONS] == [10, 15, 10, 10]
    assert profile.TOTAL == 45
    keys = [(s["key"], q["key"]) for s in profile.SECTIONS for q in s["questions"]]
    assert len(set(keys)) == len(keys)


def test_save_validate_and_clear(conn):
    profile.save(conn, "routine", {"wake_time": "06:45", "sleep_time": "23:30", "distractions": ["Noise", "Phone", "Phone"]})
    a = profile.answers(conn)["routine"]
    assert a["distractions"] == ["Phone", "Noise"]
    profile.save(conn, "routine", {"wake_time": None, "distractions": []})
    assert profile.answers(conn)["routine"] == {"sleep_time": "23:30"}


@pytest.mark.parametrize("section,changes", [
    ("life", {"age": 7}),
    ("life", {"stress": 11}),
    ("life", {"stress": True}),
    ("life", {"work_pattern": "Astronaut"}),
    ("routine", {"wake_time": "6am"}),
    ("routine", {"distractions": ["Cats"]}),
    ("life", {"nope": 1}),
])
def test_bad_answers_are_refused(conn, section, changes):
    with pytest.raises(ValueError):
        profile.save(conn, section, changes)


def test_snapshot_reads_answers_without_formulas(conn):
    profile.save(conn, "routine", {"wake_time": "06:45", "sleep_time": "23:30", "time_wasted": 1.5})
    snap = {s["label"]: s for s in profile.snapshot("routine", profile.answers(conn)["routine"])}
    assert snap["Time in bed"]["value"] == "7.2 h"
    assert snap["Time wasted"]["note"] == "10.5 h a week"
    assert snap["Screen time"]["value"] is None


def test_done_sections_and_summary(conn):
    profile.save(conn, "life", {"age": 29}, done=True)
    s = profile.summary(conn)
    assert s["answered"] == 1 and s["total"] == 45
    assert [x["done"] for x in s["sections"]] == [True, False, False, False]
    profile.save(conn, "life", {}, done=False)
    assert profile.done_sections(conn) == []


def test_sensitive_answers_only_go_to_the_coach_when_asked(conn):
    profile.save(conn, "health", {"sleep_quality": 6, "mental_health": "Anxious before deadlines"})
    plain = export(conn, 7)["profile"]["answers"]["Health & energy"]
    assert "Sleep quality" in plain and not any("mental health" in k for k in plain)
    full = export(conn, 7, sensitive=True)["profile"]["answers"]["Health & energy"]
    assert any("mental health" in k for k in full)


def test_api(client):
    r = client.put("/api/profile/life", json={"answers": {"age": 29, "stress": 7}, "done": True})
    assert r.status_code == 200
    life = r.json()["sections"][0]
    assert life["answered"] == 2 and life["done"] is True
    assert client.put("/api/profile/life", json={"answers": {"stress": 0}}).status_code == 422
    assert client.put("/api/profile/moon", json={"answers": {}}).status_code == 404


def test_profile_is_in_full_exports(conn):
    profile.save(conn, "life", {"age": 29})
    assert backups.export_all(conn)["tables"]["profile_answers"][0]["question"] == "age"


def test_onboarding_insights_do_not_need_a_check_in(conn, monkeypatch):
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    monkeypatch.setattr(coach.threading, "Thread", lambda **kw: type("T", (), {"start": lambda self: None})())
    assert coach.start(conn, "onboard-insights") > 0
    with pytest.raises(coach.NothingToReport):
        coach.start(conn, "daily-report")
