"""v0.5 "Your plan": pains and goals, custom habits, and Samuel's suggestions inbox."""

import io
import json
import sqlite3
import sys

import pytest
from fastapi.testclient import TestClient

from samuel import about, cli, db, goals, reports, scores, settings, suggestions, tasks
from samuel.api import create_app
from samuel.checkins import log_habit

TODAY = "2026-10-28"
JSON = {"content-type": "application/json"}


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def suggest(conn, *items, batch=None):
    return suggestions.add_many(conn, list(items), batch)


# Migration

def test_migration_keeps_chats_linked_to_their_reports(tmp_path):
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    for version, sql in db._migrations():
        if version >= 12:
            break
        old.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {version};\nCOMMIT;")
    old.execute("INSERT INTO reports (id, kind, date, markdown) VALUES (5, 'daily', ?, '# A day')", (TODAY,))
    old.execute("INSERT INTO chats (id, title, report_id) VALUES (1, 'About that day', 5)")
    old.commit()
    old.close()

    conn = db.connect(path)
    assert conn.execute("PRAGMA user_version").fetchone()[0] >= 12
    assert conn.execute("SELECT report_id FROM chats WHERE id = 1").fetchone()[0] == 5
    assert conn.execute("SELECT markdown FROM reports WHERE id = 5").fetchone()[0] == "# A day"
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    reports.add_report(conn, "plan", "# Your plan")
    assert list((tmp_path / "backups").glob("*before-v*.db"))  # backed up first


# Pains and goals

def test_pains_and_goals_link_to_habits_and_goals(conn):
    gid = goals.add_goal(conn, {"title": "Senior analyst by June", "area": "career"}, TODAY)
    about.add(conn, {"kind": "pain", "text": "Afternoon slump", "area": "Energy", "habit_key": "water"})
    about.add(conn, {"kind": "goal", "text": "Senior analyst by June", "goal_id": gid})
    items = about.summary(conn)["items"]
    assert [i["kind"] for i in items] == ["pain", "goal"]
    assert items[0]["habit_name"] == "Water target" and items[1]["goal_title"] == "Senior analyst by June"
    with pytest.raises(ValueError):
        about.add(conn, {"kind": "gain", "text": "Old label"})
    with pytest.raises(ValueError):
        about.add(conn, {"kind": "pain", "text": "x", "habit_key": "no_such_habit"})


def test_resolved_items_sort_last_and_leave_the_coach_view(conn):
    first = about.add(conn, {"kind": "pain", "text": "Late nights"})
    about.add(conn, {"kind": "pain", "text": "Phone in bed"})
    about.update(conn, first, {"status": "resolved"})
    assert [i["text"] for i in about.list_items(conn)] == ["Phone in bed", "Late nights"]
    assert [p["text"] for p in about.for_coach(conn)["pains_and_goals"]] == ["Phone in bed"]


def test_about_notes_save_and_clear(conn):
    about.set_notes(conn, "  Office Mon–Wed.  ")
    assert about.get_notes(conn) == "Office Mon–Wed."
    about.set_notes(conn, "")
    assert about.get_notes(conn) is None
    with pytest.raises(ValueError):
        about.set_notes(conn, "x" * (about.NOTES_MAX + 1))


# Custom habits

def test_custom_habits_count_toward_discipline(conn):
    key = settings.add_habit(conn, "Journal and plan")
    assert key == "c_journal_and_plan"
    log_habit(conn, TODAY, key, "done")
    log_habit(conn, TODAY, "water", "missed")
    assert scores.scores_for(conn, TODAY)["discipline"] == 50


def test_custom_habit_names_are_unique_and_renamable(conn):
    key = settings.add_habit(conn, "Walk after lunch")
    with pytest.raises(ValueError):
        settings.add_habit(conn, "walk after lunch")
    settings.rename_habit(conn, key, "Walk outside after lunch")
    assert settings.habit_key_by_name(conn, "WALK OUTSIDE AFTER LUNCH") == key
    assert settings.add_habit(conn, "Walk after lunch") == "c_walk_after_lunch_2"  # the key is free again, the old one stays


# Suggestions

def test_one_bad_suggestion_rejects_the_whole_batch(conn):
    with pytest.raises(ValueError, match="suggestion 2"):
        suggest(conn, {"kind": "habit", "payload": {"name": "Lights out by 23:00"}},
                {"kind": "routine", "payload": {"name": "Deep work", "start": "9am", "end": "11:00"}})
    assert suggestions.summary(conn)["total"] == 0
    with pytest.raises(ValueError, match="at most"):
        suggestions.add_many(conn, [{"kind": "habit", "payload": {"name": f"H{i}"}} for i in range(26)])


def test_samuel_does_not_repeat_waiting_or_dismissed_ideas(conn):
    suggest(conn, {"kind": "habit", "payload": {"name": "Lights out by 23:00"}},
            {"kind": "task", "payload": {"title": "Book the physio"}})
    sid = suggestions.summary(conn)["pending"][1]["id"]
    suggestions.dismiss(conn, sid)
    again = suggest(conn, {"kind": "habit", "payload": {"name": "lights out by 23:00"}},
                    {"kind": "task", "payload": {"title": "Book the physio"}},
                    {"kind": "task", "payload": {"title": "Write the README"}})
    assert again == {"added": 1, "skipped": 2}
    assert {s["title"] for s in suggestions.for_coach(conn)["dismissed"]} == {"Book the physio"}


def test_accepting_a_goal_creates_it_with_milestones_and_a_goal_entry(conn):
    suggest(conn, {"kind": "goal", "reason": "Your top goal for 3 months", "payload": {
        "title": "Python analytics project", "area": "career", "target_date": "2026-11-20",
        "milestones": [{"title": "Ingest step working", "due_date": "2026-11-06"}, {"title": "Publish it"}]}})
    sid = suggestions.summary(conn)["pending"][0]["id"]
    gid = suggestions.accept(conn, sid, TODAY)
    goal = next(g for g in goals.list_goals(conn) if g["id"] == gid)
    assert [m["title"] for m in goal["milestones"]] == ["Ingest step working", "Publish it"]
    entry = about.list_items(conn)[0]
    assert (entry["kind"], entry["goal_id"], entry["area"], entry["evidence"]) == ("goal", gid, "Career", "Your top goal for 3 months")
    assert suggestions.get(conn, sid)["status"] == "accepted"
    with pytest.raises(ValueError, match="already accepted"):
        suggestions.accept(conn, sid, TODAY)


def test_pains_and_tasks_link_by_name_once_accepted(conn):
    gid = goals.add_goal(conn, {"title": "Half-marathon under 2 h", "area": "fitness"}, TODAY)
    suggest(conn, {"kind": "habit", "payload": {"name": "Lights out by 23:00"}},
            {"kind": "pain", "payload": {"text": "Late to bed", "habit_name": "Lights out by 23:00"}},
            {"kind": "task", "payload": {"title": "Book the physio", "goal_title": "half-marathon under 2 h", "due_date": TODAY}})
    for s in suggestions.summary(conn)["pending"]:
        suggestions.accept(conn, s["id"], TODAY)
    pain = next(i for i in about.list_items(conn) if i["kind"] == "pain")
    assert pain["habit_name"] == "Lights out by 23:00"
    task = conn.execute("SELECT goal_id FROM tasks WHERE title = 'Book the physio'").fetchone()
    assert task["goal_id"] == gid


def test_an_edit_is_validated_again_and_a_bad_one_changes_nothing(conn):
    suggest(conn, {"kind": "routine", "payload": {"name": "Deep work 2", "start": "14:00", "end": "15:30", "weekdays": [0, 1, 2]}})
    sid = suggestions.summary(conn)["pending"][0]["id"]
    with pytest.raises(ValueError):
        suggestions.accept(conn, sid, TODAY, {"name": "Deep work 2", "start": "25:00", "end": "15:30"})
    assert suggestions.get(conn, sid)["status"] == "pending"
    suggestions.accept(conn, sid, TODAY, {"name": "Deep work 2", "start": "14:30", "end": "16:00", "weekdays": [0, 1, 2]})
    block = conn.execute("SELECT start, end FROM routines").fetchone()
    assert (block["start"], block["end"]) == ("14:30", "16:00")


def test_a_milestone_needs_one_of_your_active_goals(conn):
    with pytest.raises(ValueError, match="active goals"):
        suggest(conn, {"kind": "milestone", "payload": {"title": "Ship it", "goal_title": "Not a goal"}})
    goals.add_goal(conn, {"title": "Side project", "area": "business"}, TODAY)
    suggest(conn, {"kind": "milestone", "payload": {"title": "Ship it", "goal_title": "Side project"}})
    suggestions.accept(conn, suggestions.summary(conn)["pending"][0]["id"], TODAY)
    assert goals.list_goals(conn)[0]["milestones"][0]["title"] == "Ship it"


def test_tasks_never_take_a_goal_id_from_the_coach(conn):
    gid = goals.add_goal(conn, {"title": "Private goal", "area": "other"}, TODAY)
    suggest(conn, {"kind": "task", "payload": {"title": "Something", "goal_id": gid}})
    sid = suggestions.summary(conn)["pending"][0]["id"]
    tid = suggestions.accept(conn, sid, TODAY)
    assert tasks._all(conn)[0]["id"] == tid
    assert conn.execute("SELECT goal_id FROM tasks WHERE id = ?", (tid,)).fetchone()[0] is None


# CLI, export and API

def run_cli(args, capsys, monkeypatch, stdin=None):
    if stdin is not None:
        monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
    cli.main(args)
    return capsys.readouterr().out


def test_suggest_add_reads_json_from_stdin(conn, capsys, monkeypatch):
    body = json.dumps({"batch": "plan", "suggestions": [{"kind": "habit", "payload": {"name": "Walk after lunch"}, "reason": "Energy dips at 14:00"}]})
    assert "Saved 1 suggestions" in run_cli(["suggest", "add"], capsys, monkeypatch, body)
    s = suggestions.summary(conn)["pending"][0]
    assert (s["batch"], s["reason"]) == ("plan", "Energy dips at 14:00")


def test_suggest_add_only_takes_stdin_and_reports_bad_input(capsys, monkeypatch, tmp_path):
    with pytest.raises(SystemExit):
        run_cli(["suggest", "add", "--file", str(tmp_path / "x.json")], capsys, monkeypatch)
    with pytest.raises(SystemExit, match="key: value"):
        run_cli(["suggest", "add"], capsys, monkeypatch, "not a suggestion")
    with pytest.raises(SystemExit, match="must be JSON"):
        run_cli(["suggest", "add"], capsys, monkeypatch, "{not json")


def test_export_shows_what_samuel_knows_and_suggested(conn):
    about.set_notes(conn, "Office Mon–Wed")
    about.add(conn, {"kind": "pain", "text": "Late nights"})
    settings.add_habit(conn, "Walk after lunch")
    suggest(conn, {"kind": "task", "payload": {"title": "Book the physio"}})
    out = reports.export(conn, 7, TODAY)
    assert out["about"]["notes"] == "Office Mon–Wed"
    assert out["about"]["pains_and_goals"] == [{"kind": "pain", "text": "Late nights"}]
    assert {"name": "Walk after lunch", "tracking": True, "own": True} in out["habits"]
    assert out["suggestions"]["pending"] == [{"kind": "task", "title": "Book the physio"}]


def test_breakdown_goal_export(conn, capsys, monkeypatch):
    gid = goals.add_goal(conn, {"title": "Python analytics project", "area": "career"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "Pick the dataset"})
    out = json.loads(run_cli(["export", "--since", "1d", "--goal", str(gid)], capsys, monkeypatch))
    assert out["breakdown_goal"]["milestones"] == [{"title": "Pick the dataset", "due_date": None, "done": False}]
    with pytest.raises(SystemExit, match="no active goal"):
        run_cli(["export", "--goal", "999"], capsys, monkeypatch)


def test_api_accepts_and_dismisses_suggestions(client, conn):
    suggest(conn, {"kind": "habit", "payload": {"name": "Walk after lunch"}},
            {"kind": "task", "payload": {"title": "Book the physio"}})
    first, second = (s["id"] for s in client.get("/api/suggestions").json()["pending"])
    r = client.post(f"/api/suggestions/{first}/accept?today={TODAY}", json={})
    assert r.status_code == 200 and r.json()["total"] == 1
    assert client.post(f"/api/suggestions/{first}/accept", json={}).status_code == 422
    assert client.get("/api/status").json()["suggestions"] == 1
    assert client.post(f"/api/suggestions/{second}/dismiss", headers=JSON).json()["total"] == 0
    assert client.post("/api/suggestions/999/dismiss", headers=JSON).status_code == 404
    assert any(h["name"] == "Walk after lunch" for h in client.get(f"/api/settings?today={TODAY}").json()["habits"])


def test_api_about_page_and_undoable_delete(client):
    page = client.put("/api/about", json={"notes": "Run club Saturdays"}).json()
    assert page["notes"] == "Run club Saturdays"
    page = client.post("/api/pains-goals", json={"kind": "pain", "text": "Late nights", "area": "Sleep"}).json()
    item = page["items"][0]
    assert page["counts"] == {"pain": 1, "goal": 0}
    r = client.delete(f"/api/pains-goals/{item['id']}", headers=JSON)
    assert r.json()["items"] == [] and "x-samuel-undo" in r.headers
    assert client.post(f"/api/trash/{r.headers['x-samuel-undo']}/restore", headers=JSON).status_code == 200
    assert [i["text"] for i in client.get("/api/about").json()["items"]] == ["Late nights"]


def test_api_adds_and_renames_custom_habits(client):
    habits = client.post("/api/habit-settings", json={"name": "Stretching"}).json()
    key = next(h["key"] for h in habits if h["name"] == "Stretching")
    habits = client.put(f"/api/habit-settings/{key}", json={"name": "Stretch and foam roll"}).json()
    assert any(h["name"] == "Stretch and foam roll" for h in habits)
    assert client.post("/api/habit-settings", json={"name": "Water target"}).status_code == 422


def test_cross_site_pages_cannot_accept_suggestions():
    local = TestClient(create_app(), base_url="http://127.0.0.1:8765")
    r = local.post("/api/suggestions/1/accept", json={}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_plan_builder_breaks_down_only_active_goals(conn):
    from samuel import coach

    with pytest.raises(ValueError, match="no such active goal"):
        coach.start(conn, "plan-builder", goal_id=42)
    with pytest.raises(ValueError, match="only the plan builder"):
        coach.start(conn, "daily-report", goal_id=1)


# The plain-text format coach runs use (Claude Code blocks commands with JSON braces)

PLAN_TEXT = """batch: plan
---
kind: goal
reason: Your top goal for the next 3 months.
title: Python analytics project
area: career
target_date: 2026-12-18
milestone: Pick the dataset | 2026-11-06
milestone: Publish it
---
kind: routine
reason: Your energy taps drop after 14:00.
name: Walk outside
start: 15:30
end: 15:45
weekdays: 0 1 2
block_kind: recovery
steps: Leave the phone | Walk ten minutes
remind_before: no
---
kind: task
title: Shortlist three datasets
due_date: 2026-11-02
goal_title: Python analytics project
subtasks: Transport | Weather | Housing
"""


def test_text_format_reads_every_field():
    batch, items = suggestions.parse_text(PLAN_TEXT)
    assert batch == "plan" and [i["kind"] for i in items] == ["goal", "routine", "task"]
    assert items[0]["payload"]["milestones"] == [{"title": "Pick the dataset", "due_date": "2026-11-06"}, {"title": "Publish it"}]
    walk = items[1]["payload"]
    assert (walk["start"], walk["weekdays"], walk["kind"], walk["remind_before"]) == ("15:30", [0, 1, 2], "recovery", False)
    assert walk["steps"] == ["Leave the phone", "Walk ten minutes"]
    assert items[2]["payload"]["subtasks"] == ["Transport", "Weather", "Housing"]
    assert "{" not in PLAN_TEXT and '"' not in PLAN_TEXT


def test_text_format_reports_bad_lines():
    with pytest.raises(ValueError, match="start each suggestion"):
        suggestions.parse_text("name: orphan")
    with pytest.raises(ValueError, match="line 2: weekdays"):
        suggestions.parse_text("kind: routine\nweekdays: mon tue")
    with pytest.raises(ValueError, match="key: value"):
        suggestions.parse_text("kind: habit\njust words")


def test_suggest_add_takes_the_text_format(conn, capsys, monkeypatch):
    out = run_cli(["suggest", "add"], capsys, monkeypatch, PLAN_TEXT)
    assert "Saved 3 suggestions" in out
    for s in suggestions.summary(conn)["pending"]:
        suggestions.accept(conn, s["id"], TODAY)
    walk = conn.execute("SELECT kind, steps, remind_before FROM routines WHERE name = 'Walk outside'").fetchone()
    assert (walk["kind"], json.loads(walk["steps"]), walk["remind_before"]) == ("recovery", ["Leave the phone", "Walk ten minutes"], 0)
    task = conn.execute("SELECT goal_id FROM tasks WHERE title = 'Shortlist three datasets'").fetchone()
    assert task["goal_id"] is not None



def test_deleting_a_habit_removes_its_history_and_unlinks_it(conn):
    from samuel import routines

    key = settings.add_habit(conn, "Walk after lunch")
    log_habit(conn, TODAY, key, "done")
    block = routines.add(conn, {"name": "Walk", "start": "12:30", "end": "12:45", "habit_key": key})
    about.add(conn, {"kind": "pain", "text": "Afternoon slump", "habit_key": key})
    settings.delete_habit(conn, key)
    assert settings.habit_key_by_name(conn, "Walk after lunch") is None
    assert conn.execute("SELECT COUNT(*) FROM habit_logs l JOIN habits h ON h.id = l.habit_id WHERE h.key = ?", (key,)).fetchone()[0] == 0
    assert conn.execute("SELECT habit_key FROM routines WHERE id = ?", (block,)).fetchone()[0] is None
    assert about.list_items(conn)[0]["habit_key"] is None
    with pytest.raises(KeyError):
        settings.delete_habit(conn, key)



def test_habits_move_up_and_down(conn):
    first, second = [h["key"] for h in settings.habit_list(conn)][:2]
    settings.move_habit(conn, second, "up")
    assert [h["key"] for h in settings.habit_list(conn)][:2] == [second, first]
    settings.move_habit(conn, second, "up")  # already first: stays put
    assert settings.habit_list(conn)[0]["key"] == second
    last = settings.habit_list(conn)[-1]["key"]
    settings.move_habit(conn, last, "down")
    assert settings.habit_list(conn)[-1]["key"] == last
    with pytest.raises(ValueError):
        settings.move_habit(conn, first, "sideways")
