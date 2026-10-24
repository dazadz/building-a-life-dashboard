import pytest
from fastapi.testclient import TestClient

from samuel import backups, goals, tasks
from samuel.api import create_app
from samuel.reports import export

NOW = "2026-10-24T13:20"
TODAY = "2026-10-24"
JSON = {"content-type": "application/json"}


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def test_views_and_counts(conn):
    tasks.add(conn, {"title": "Today", "due_date": TODAY})
    tasks.add(conn, {"title": "Late", "due_date": "2026-10-20"})
    tasks.add(conn, {"title": "Soon", "due_date": "2026-10-27"})
    tasks.add(conn, {"title": "Someday"})
    done = tasks.add(conn, {"title": "Finished", "due_date": TODAY})
    tasks.update(conn, done, {"done": True}, NOW)
    s = tasks.summary(conn, NOW)
    assert s["counts"] == {"today": 1, "upcoming": 2, "overdue": 1, "all": 4, "done": 1}
    assert s["this_week"] == 1
    assert {t["title"]: t["view"] for t in s["tasks"]}["Someday"] == "someday"


def test_snooze_an_hour_and_to_tomorrow(conn):
    tid = tasks.add(conn, {"title": "Call", "due_date": TODAY, "remind_at": f"{TODAY}T13:00"})
    tasks.snooze(conn, tid, "hour", NOW)
    t = tasks.summary(conn, NOW)["tasks"][0]
    assert t["remind_at"] == f"{TODAY}T14:20"
    tasks.snooze(conn, tid, "tomorrow", NOW)
    t = tasks.summary(conn, NOW)["tasks"][0]
    assert t["due_date"] == "2026-10-25" and t["remind_at"] == "2026-10-25T14:20"


def test_reminders_fire_once_until_moved(conn):
    tid = tasks.add(conn, {"title": "Call", "remind_at": f"{TODAY}T13:00"})
    tasks.add(conn, {"title": "Later", "remind_at": f"{TODAY}T18:00"})
    assert [r["title"] for r in tasks.due_reminders(conn, NOW)] == ["Call"]
    tasks.mark_notified(conn, tid, NOW)
    assert tasks.due_reminders(conn, NOW) == []
    tasks.snooze(conn, tid, "hour", NOW)
    assert tasks.due_reminders(conn, "2026-10-24T14:20")[0]["title"] == "Call"


def test_done_tasks_dont_remind(conn):
    tid = tasks.add(conn, {"title": "Call", "remind_at": f"{TODAY}T13:00"})
    tasks.update(conn, tid, {"done": True}, NOW)
    assert tasks.due_reminders(conn, NOW) == []


def test_subtasks_and_goal_link(conn):
    gid = goals.add_goal(conn, {"title": "Promotion", "area": "career"}, TODAY)
    tid = tasks.add(conn, {"title": "Budget", "goal_id": gid, "subtasks": ["Export plan", "Add bands"]})
    first = tasks.summary(conn, NOW)["tasks"][0]["subtasks"][0]["id"]
    tasks.set_subtask(conn, first, True)
    tasks.add_subtask(conn, tid, "Add buffer")
    t = tasks.summary(conn, NOW)["tasks"][0]
    assert [s["done"] for s in t["subtasks"]] == [True, False, False]
    assert t["goal_title"] == "Promotion"
    goals.delete_goal(conn, gid)
    assert tasks.summary(conn, NOW)["tasks"][0]["goal_id"] is None


@pytest.mark.parametrize("fields", [
    {"title": ""},
    {"title": "X", "priority": "urgent"},
    {"title": "X", "due_date": "friday"},
    {"title": "X", "remind_at": "2026-10-24 13:00"},
    {"title": "X", "goal_id": 99},
    {"title": "X", "subtasks": [""]},
])
def test_bad_tasks_are_refused(conn, fields):
    with pytest.raises(ValueError):
        tasks.add(conn, fields)


def test_api(client):
    r = client.post(f"/api/tasks?now={NOW}", json={"title": "Budget", "list": "Work", "due_date": TODAY, "remind_at": f"{TODAY}T13:00"})
    tid = r.json()["tasks"][0]["id"]
    assert r.json()["counts"]["today"] == 1
    assert client.get(f"/api/reminders/due?now={NOW}").json()[0]["id"] == tid
    assert client.post(f"/api/tasks/{tid}/notified?now={NOW}", headers=JSON).status_code == 200
    assert client.get(f"/api/reminders/due?now={NOW}").json() == []
    r = client.post(f"/api/tasks/{tid}/snooze?now={NOW}", json={"how": "tomorrow"})
    assert r.json()["tasks"][0]["due_date"] == "2026-10-25"
    r = client.put(f"/api/tasks/{tid}?now={NOW}", json={"done": True})
    assert r.json()["counts"]["done"] == 1
    assert client.get("/api/tasks?now=yesterday").status_code == 422
    assert client.delete(f"/api/tasks/{tid}", headers=JSON).json()["tasks"] == []


def test_tasks_reach_the_coach_and_backups(conn):
    tasks.add(conn, {"title": "Late one", "due_date": "2026-10-20", "priority": "high"})
    tasks.add(conn, {"title": "Far away", "due_date": "2026-12-01"})
    out = export(conn, 7, TODAY)["tasks"]["open_due_soon"]
    assert [t["title"] for t in out] == ["Late one"] and out[0]["overdue"] is True
    assert {t["title"] for t in backups.export_all(conn)["tables"]["tasks"]} == {"Late one", "Far away"}



def test_subtasks_can_have_due_dates(conn):
    from samuel import tasks as t

    tid = t.add(conn, {"title": "Plan the trip", "subtasks": ["Pack", {"title": "Book flights", "due_date": "2026-11-02"}]})
    subs = {s["title"]: s for s in t._all(conn)[0]["subtasks"]}
    assert subs["Pack"]["due_date"] is None and subs["Book flights"]["due_date"] == "2026-11-02"
    t.add_subtask(conn, tid, "Get euros", "2026-11-05")
    sid = next(s["id"] for s in t._all(conn)[0]["subtasks"] if s["title"] == "Pack")
    t.set_subtask(conn, sid, None, due_date="2026-11-04")
    t.set_subtask(conn, sid, True)
    pack = next(s for s in t._all(conn)[0]["subtasks"] if s["title"] == "Pack")
    assert (pack["due_date"], pack["done"]) == ("2026-11-04", True)
    t.set_subtask(conn, sid, None, due_date=None)
    assert next(s for s in t._all(conn)[0]["subtasks"] if s["title"] == "Pack")["due_date"] is None
    with pytest.raises(ValueError):
        t.add_subtask(conn, tid, "Bad date", "next week")
