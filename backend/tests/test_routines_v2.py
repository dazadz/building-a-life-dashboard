"""Routines v2: day types, blocks across midnight, the block log, reminders and tasks queued for blocks."""

import pytest
from fastapi.testclient import TestClient

from samuel import digest, goals, routines, settings, suggestions, tasks
from samuel.api import create_app
from samuel.checkins import habits_for

MON, TUE, WED, THU = "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"
JSON = {"content-type": "application/json"}


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


@pytest.fixture
def week(conn):
    """Office Mon–Wed, home Thu–Fri, a block for each, and one every weekday."""
    office = routines.add_day_type(conn, "Office day", [0, 1, 2])
    home = routines.add_day_type(conn, "Home day", [3, 4])
    ids = {
        "commute": routines.add(conn, {"name": "Commute", "start": "07:30", "end": "08:15", "kind": "fixed", "day_type_id": office}),
        "deep": routines.add(conn, {"name": "Deep work", "start": "08:30", "end": "10:30", "day_type_id": home, "steps": ["Phone away"]}),
        "lunch": routines.add(conn, {"name": "Lunch walk", "start": "12:30", "end": "13:00", "weekdays": [0, 1, 2, 3, 4], "kind": "recovery"}),
    }
    return {"office": office, "home": home, **ids}


def names(conn, day):
    return [b["name"] for b in routines.plan(conn, day)["blocks"]]


def test_day_types_pick_the_blocks_and_a_day_can_be_switched(conn, week):
    assert names(conn, MON) == ["Commute", "Lunch walk"]
    assert names(conn, THU) == ["Deep work", "Lunch walk"]
    routines.set_day_override(conn, MON, week["home"])
    p = routines.plan(conn, MON)
    assert [b["name"] for b in p["blocks"]] == ["Deep work", "Lunch walk"]
    assert p["day_type"] == {"id": week["home"], "name": "Home day", "overridden": True}
    routines.set_day_override(conn, MON, None)
    assert routines.plan(conn, MON)["day_type"]["name"] == "Office day"


def test_a_weekday_belongs_to_one_day_type(conn, week):
    routines.update_day_type(conn, week["home"], {"weekdays": [2, 3, 4]})
    office = next(t for t in routines.list_day_types(conn) if t["id"] == week["office"])
    assert office["weekdays"] == [0, 1]
    with pytest.raises(ValueError, match="already have"):
        routines.add_day_type(conn, "office DAY")


def test_deleting_a_day_type_keeps_its_blocks(conn, week):
    routines.delete_day_type(conn, week["home"])
    deep = next(b for b in routines.list_routines(conn) if b["name"] == "Deep work")
    assert deep["day_type_id"] is None and deep["day_type"] is None


def test_blocks_may_cross_midnight_but_not_be_empty(conn):
    late = routines.add(conn, {"name": "Study", "start": "23:30", "end": "00:30"})
    assert digest.next_block(conn, WED, "23:45") == {"name": "Study", "start": "23:30", "end": "00:30", "state": "now"}
    with pytest.raises(ValueError, match="same time"):
        routines.add(conn, {"name": "Nothing", "start": "09:00", "end": "09:00"})
    with pytest.raises(ValueError, match="same time"):
        routines.update(conn, late, {"end": "23:30"})


def test_steps_and_links_are_checked(conn):
    with pytest.raises(ValueError, match="steps"):
        routines.add(conn, {"name": "X", "start": "09:00", "end": "10:00", "steps": ["ok"] * 9})
    with pytest.raises(ValueError, match="no such goal"):
        routines.add(conn, {"name": "X", "start": "09:00", "end": "10:00", "goal_id": 99})
    with pytest.raises(ValueError, match="no such habit"):
        routines.add(conn, {"name": "X", "start": "09:00", "end": "10:00", "habit_key": "nope"})


def test_done_ticks_the_linked_habit_and_skips_keep_their_reason(conn, week):
    walk = settings.add_habit(conn, "Walk after lunch")
    routines.update(conn, week["lunch"], {"habit_key": walk})
    routines.log_block(conn, week["lunch"], MON, "done")
    assert {h["key"]: h["status"] for h in habits_for(conn, MON)}[walk] == "done"
    routines.log_block(conn, week["commute"], MON, "skipped", "Train cancelled")
    blocks = {b["name"]: b for b in routines.plan(conn, MON)["blocks"]}
    assert (blocks["Commute"]["status"], blocks["Commute"]["reason"]) == ("skipped", "Train cancelled")
    assert routines.for_coach(conn, TUE)["last_14_days"]["Commute"] == {"done": 0, "skipped": 1, "reasons": ["Train cancelled"]}


def test_reminders_five_minutes_before_and_at_the_start_once_each(conn, week):
    due = lambda at: [(r["name"], r["which"]) for r in routines.due_reminders(conn, f"{THU}T{at}")]  # noqa: E731
    assert due("08:20") == []
    assert due("08:25") == [("Deep work", "heads_up")]
    routines.mark_shown(conn, week["deep"], THU, "heads_up", "08:25")
    assert due("08:27") == []
    assert due("08:30") == [("Deep work", "start")]
    assert routines.due_reminders(conn, f"{THU}T08:30")[0]["steps"] == ["Phone away"]
    routines.mark_shown(conn, week["deep"], THU, "start", "08:30")
    assert due("08:31") == []
    assert due("09:00") == []  # never hours late


def test_snooze_shows_the_start_again_and_done_silences_it(conn, week):
    routines.mark_shown(conn, week["deep"], THU, "start", "08:30")
    routines.snooze(conn, week["deep"], THU, "08:45")
    assert routines.due_reminders(conn, f"{THU}T08:44") == []
    assert [r["which"] for r in routines.due_reminders(conn, f"{THU}T08:45")] == ["start"]
    routines.log_block(conn, week["deep"], THU, "done")
    assert routines.due_reminders(conn, f"{THU}T08:46") == []


def test_reminders_can_be_turned_off(conn, week):
    routines.update(conn, week["deep"], {"remind_before": False, "remind_start": False})
    assert routines.due_reminders(conn, f"{THU}T08:25") == []
    assert routines.due_reminders(conn, f"{THU}T08:30") == []


def test_a_queued_task_shows_in_its_block_and_rolls_to_the_next_run(conn, week):
    tasks.add(conn, {"title": "Write the CSV loader", "routine_id": week["deep"], "due_date": "2026-10-22"})  # last Thursday
    tasks.add(conn, {"title": "Later", "routine_id": week["deep"], "due_date": "2026-11-05"})
    deep = next(b for b in routines.plan(conn, THU)["blocks"] if b["name"] == "Deep work")
    assert [(t["title"], t["rolled"]) for t in deep["tasks"]] == [("Write the CSV loader", 2)]  # missed Thu and Fri
    assert routines.due_reminders(conn, f"{THU}T08:30")[0]["task"] == "Write the CSV loader"


def test_suggested_blocks_and_tasks_link_by_name(conn, week):
    gid = goals.add_goal(conn, {"title": "Side project", "area": "business"}, MON)
    suggestions.add_many(conn, [
        {"kind": "routine", "payload": {"name": "Evening study", "start": "20:00", "end": "21:00", "weekdays": [5, 6],
                                        "day_type": "Weekend", "goal_title": "Side project", "day_type_id": 999, "goal_id": 999}},
        {"kind": "task", "payload": {"title": "Outline the README", "block": "deep work", "routine_id": 999, "due_date": THU}},
    ])
    for s in suggestions.summary(conn)["pending"]:
        suggestions.accept(conn, s["id"], MON)
    study = next(b for b in routines.list_routines(conn) if b["name"] == "Evening study")
    assert (study["day_type"], study["goal_id"]) == ("Weekend", gid)  # ids from the coach are ignored
    weekend = next(t for t in routines.list_day_types(conn) if t["name"] == "Weekend")
    assert weekend["weekdays"] == [5, 6]
    task = conn.execute("SELECT routine_id FROM tasks WHERE title = 'Outline the README'").fetchone()
    assert task["routine_id"] == week["deep"]


def test_api_switches_the_day_logs_blocks_and_reminds(client, conn, week):
    p = client.put(f"/api/plan/{MON}/day-type", json={"day_type_id": week["home"]}).json()
    assert p["day_type"]["overridden"] is True
    p = client.put(f"/api/plan/{MON}/blocks/{week['deep']}", json={"status": "skipped", "reason": "Doctor"}).json()
    assert next(b for b in p["blocks"] if b["name"] == "Deep work")["status"] == "skipped"
    due = client.get(f"/api/block-reminders/due?now={THU}T08:25").json()
    assert due[0]["which"] == "heads_up"
    assert client.post(f"/api/block-reminders/{week['deep']}/shown?which=heads_up&now={THU}T08:25", headers=JSON).json() == {"ok": True}
    assert client.get(f"/api/block-reminders/due?now={THU}T08:26").json() == []
    assert client.post(f"/api/block-reminders/{week['deep']}/shown?which=nope&now={THU}T08:25", headers=JSON).status_code == 422
    types = client.post("/api/day-types", json={"name": "Weekend", "weekdays": [5, 6]}).json()
    assert [t["name"] for t in types] == ["Office day", "Home day", "Weekend"]
    assert client.put(f"/api/plan/{MON}/blocks/999", json={"status": "done"}).status_code == 404


def test_types_migration_keeps_links_and_maps_work_tasks(tmp_path):
    import sqlite3

    from samuel import db

    path = tmp_path / "v14.db"
    old = sqlite3.connect(path)
    for version, sql in db._migrations():
        if version >= 15:
            break
        old.execute("PRAGMA foreign_keys = OFF")
        old.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {version};\nCOMMIT;")
    old.execute("INSERT INTO routines (id, name, start, end, kind) VALUES (3, 'Gym', '17:00', '18:00', 'habit')")
    old.execute("INSERT INTO routine_logs (routine_id, date, status) VALUES (3, ?, 'done')", (MON,))
    old.execute("INSERT INTO tasks (id, title, list, routine_id) VALUES (8, 'Send the report', 'Work', 3)")
    old.execute("INSERT INTO tasks (id, title, list) VALUES (9, 'Buy milk', 'Personal')")
    old.commit()
    old.close()

    conn = db.connect(path)
    assert tuple(conn.execute("SELECT routine_id, type FROM tasks WHERE id = 8").fetchone()) == (3, "work")
    assert conn.execute("SELECT type FROM tasks WHERE id = 9").fetchone()[0] is None
    assert conn.execute("SELECT status FROM routine_logs WHERE routine_id = 3").fetchone()[0] == "done"
    routines.add(conn, {"name": "Prayer", "start": "06:30", "end": "06:45", "kind": "spiritual"})
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO routines (name, start, end, kind) VALUES ('x', '01:00', '02:00', 'nap')")


def test_tasks_take_a_type(conn):
    tid = tasks.add(conn, {"title": "Apply to three roles", "type": "work"})
    tasks.update(conn, tid, {"type": "spiritual"}, f"{MON}T09:00")
    assert conn.execute("SELECT type FROM tasks WHERE id = ?", (tid,)).fetchone()[0] == "spiritual"
    with pytest.raises(ValueError, match="type must be one of"):
        tasks.add(conn, {"title": "x", "type": "chores"})


def test_suggestions_set_a_type_with_type_lines(conn):
    batch, items = suggestions.parse_text(
        "kind: routine\nname: Prayer\nstart: 06:30\nend: 06:45\ntype: Spiritual\n---\nkind: task\ntitle: Resume\ntype: work"
    )
    assert items[0]["payload"]["kind"] == "spiritual" and items[1]["payload"]["type"] == "work"
