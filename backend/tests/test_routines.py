import pytest
from fastapi.testclient import TestClient

from samuel import backups, goals, routines, settings
from samuel.api import create_app
from samuel.reports import export

TODAY = "2026-10-24"  # a Saturday
JSON = {"content-type": "application/json"}


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def test_suggested_routine_follows_the_targets(conn):
    settings.update(conn, {"wake_target": "06:30", "deep_work_target_hours": 3, "sleep_target_hours": 8}, TODAY)
    blocks = {b["name"]: b for b in routines.suggested(conn, TODAY)}
    assert blocks["Morning routine"]["start"] == "06:30"
    assert blocks["Deep work 1"]["end"] == "11:00" and blocks["Deep work 2"]["end"] == "15:00"
    assert blocks["Wind down"]["end"] == "22:30"  # 8 h before 06:30


def test_no_second_deep_work_block_for_short_targets(conn):
    settings.update(conn, {"deep_work_target_hours": 1.5}, TODAY)
    names = [b["name"] for b in routines.suggested(conn, TODAY)]
    assert "Deep work 2" not in names


def test_plan_lists_todays_blocks_and_milestones(conn):
    routines.add(conn, {"name": "Long run", "start": "08:00", "end": "09:30", "weekdays": [5]})
    routines.add(conn, {"name": "Deep work", "start": "09:00", "end": "11:00", "weekdays": [0, 1, 2, 3, 4]})
    gid = goals.add_goal(conn, {"title": "Half marathon", "area": "fitness"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "14 km", "due_date": TODAY})
    p = routines.plan(conn, TODAY)
    assert [b["name"] for b in p["blocks"]] == ["Long run"]
    assert p["due_today"][0]["title"] == "14 km"


@pytest.mark.parametrize("fields", [
    {"name": "", "start": "08:00", "end": "09:00"},
    {"name": "X", "start": "8am", "end": "09:00"},
    {"name": "X", "start": "08:00", "end": "09:00", "weekdays": []},
    {"name": "X", "start": "08:00", "end": "09:00", "weekdays": [7]},
])
def test_bad_blocks_are_refused(conn, fields):
    with pytest.raises(ValueError):
        routines.add(conn, fields)


def test_api(client):
    assert client.post(f"/api/routines/suggested?today={TODAY}", headers=JSON).status_code == 200
    assert client.post(f"/api/routines/suggested?today={TODAY}", headers=JSON).status_code == 422  # only once
    blocks = client.get("/api/routines").json()
    first = blocks[0]["id"]
    r = client.put(f"/api/routines/{first}", json={"note": None, "weekdays": [6, 0, 0]})
    changed = next(b for b in r.json() if b["id"] == first)
    assert changed["note"] is None and changed["weekdays"] == [0, 6]
    assert len(client.delete(f"/api/routines/{first}", headers=JSON).json()) == len(blocks) - 1
    assert client.get(f"/api/plan/{TODAY}").json()["has_routine"] is True


def test_routine_reaches_the_coach_and_backups(conn):
    routines.add(conn, {"name": "Deep work", "start": "09:00", "end": "11:00", "weekdays": [0, 1]})
    assert export(conn, 7, TODAY)["routine"][0] == {"name": "Deep work", "time": "09:00–11:00", "days": ["Mon", "Tue"], "note": None}
    assert backups.export_all(conn)["tables"]["routines"][0]["name"] == "Deep work"
