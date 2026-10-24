import pytest
from fastapi.testclient import TestClient

from samuel import backups, goals
from samuel.api import create_app
from samuel.reports import export

TODAY = "2026-10-24"
# Writes must be JSON (see security.py), DELETE included.
JSON = {"content-type": "application/json"}


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def test_a_goal_without_milestones_has_no_progress_not_zero(conn):
    goals.add_goal(conn, {"title": "Run a 10k", "area": "fitness"}, TODAY)
    [g] = goals.list_goals(conn)
    assert g["progress"] is None and g["next_milestone"] is None
    assert g["impact"] == 3 and g["effort"] == 3


def test_progress_and_next_milestone(conn):
    gid = goals.add_goal(conn, {"title": "Save €5k", "area": "financial", "target_date": "2027-01-31"}, TODAY)
    a = goals.add_milestone(conn, gid, {"title": "€1k", "due_date": "2026-10-20"})
    goals.add_milestone(conn, gid, {"title": "Undated"})
    goals.add_milestone(conn, gid, {"title": "€3k", "due_date": "2026-11-30"})
    goals.update_milestone(conn, a, {"done": True}, TODAY)
    [g] = goals.list_goals(conn)
    assert g["progress"] == 33
    assert g["next_milestone"]["title"] == "€3k"  # dated before undated
    assert [m["done_date"] for m in g["milestones"]][0] == TODAY


def test_this_week_lists_open_milestones_due_soon_or_overdue(conn):
    gid = goals.add_goal(conn, {"title": "Ship it", "area": "business"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "Late", "due_date": "2026-10-20"})
    goals.add_milestone(conn, gid, {"title": "Sunday", "due_date": "2026-10-30"})
    goals.add_milestone(conn, gid, {"title": "Next month", "due_date": "2026-11-15"})
    week = goals.summary(conn, TODAY)["week"]
    assert [(m["title"], m["overdue"]) for m in week] == [("Late", True), ("Sunday", False)]

    goals.update_goal(conn, gid, {"done": True}, TODAY)
    summary = goals.summary(conn, TODAY)
    assert summary["week"] == [] and summary["completed_this_year"] == 1


@pytest.mark.parametrize("fields", [
    {"title": "", "area": "fitness"},
    {"title": "X", "area": "space travel"},
    {"title": "X", "area": "fitness", "impact": 9},
    {"title": "X", "area": "fitness", "target_date": "next year"},
])
def test_bad_goals_are_refused(conn, fields):
    with pytest.raises(ValueError):
        goals.add_goal(conn, fields, TODAY)


def test_deleting_a_goal_deletes_its_milestones(conn):
    gid = goals.add_goal(conn, {"title": "Ship it", "area": "business"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "Step"})
    goals.delete_goal(conn, gid)
    assert conn.execute("SELECT COUNT(*) FROM milestones").fetchone()[0] == 0


def test_api_round_trip(client):
    r = client.post(f"/api/goals?today={TODAY}", json={"title": "Half marathon", "area": "fitness", "impact": 4})
    assert r.status_code == 200
    gid = r.json()["goals"][0]["id"]

    r = client.post(f"/api/goals/{gid}/milestones?today={TODAY}", json={"title": "14 km", "due_date": "2026-10-25"})
    mid = r.json()["goals"][0]["milestones"][0]["id"]
    assert r.json()["week"][0]["goal_title"] == "Half marathon"

    r = client.put(f"/api/milestones/{mid}?today={TODAY}", json={"done": True})
    assert r.json()["goals"][0]["progress"] == 100

    r = client.put(f"/api/goals/{gid}?today={TODAY}", json={"target_date": "2027-03-14"})
    assert r.json()["goals"][0]["target_date"] == "2027-03-14"
    r = client.put(f"/api/goals/{gid}?today={TODAY}", json={"target_date": None})
    assert r.json()["goals"][0]["target_date"] is None

    assert client.put("/api/vision", json={"vision": "  Fit and free  "}).json()["vision"] == "Fit and free"
    assert client.delete(f"/api/goals/{gid}", headers=JSON).json()["goals"] == []


def test_api_errors(client):
    assert client.put("/api/goals/99", json={"title": "X"}).status_code == 404
    assert client.post("/api/goals", json={"title": "X", "area": "moon"}).status_code == 422
    assert client.delete("/api/milestones/99", headers=JSON).status_code == 404


def test_export_gives_the_coach_active_goals(conn):
    gid = goals.add_goal(conn, {"title": "Ship it", "area": "business"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "Landing page", "due_date": "2026-10-27"})
    done = goals.add_goal(conn, {"title": "Old one", "area": "other"}, TODAY)
    goals.update_goal(conn, done, {"done": True}, TODAY)
    out = export(conn, 7, TODAY)["goals"]
    assert [g["title"] for g in out["active"]] == ["Ship it"]
    assert out["due_this_week"][0]["title"] == "Landing page"
    assert "goals" in export(conn, 7, TODAY)["note"]


def test_goals_are_in_full_exports(conn):
    goals.add_goal(conn, {"title": "Ship it", "area": "business"}, TODAY)
    tables = backups.export_all(conn)["tables"]
    assert tables["goals"][0]["title"] == "Ship it" and tables["milestones"] == []
    assert not backups.is_empty(conn)


def test_goals_can_be_about_faith(conn):
    gid = goals.add_goal(conn, {"title": "Daily quiet time", "area": "faith"}, "2026-10-26")
    assert next(g for g in goals.list_goals(conn) if g["id"] == gid)["area"] == "faith"
