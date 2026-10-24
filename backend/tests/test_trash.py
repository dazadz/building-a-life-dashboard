from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from samuel import chats, goals, tasks, trash
from samuel.api import create_app


@pytest.fixture
def client():
    return TestClient(create_app(), base_url="http://127.0.0.1:8765")


def test_deleting_a_task_can_be_undone_with_its_subtasks(conn, client):
    task_id = tasks.add(conn, {"title": "Budget draft", "subtasks": ["Numbers", "Charts"]})
    r = client.request("DELETE", f"/api/tasks/{task_id}", json={})
    assert unquote(r.headers["X-Samuel-Undo-Title"]) == "Budget draft"
    assert conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0

    restored = client.post(f"/api/trash/{r.headers['X-Samuel-Undo']}/restore", json={}).json()
    assert restored == {"kind": "task", "id": task_id, "title": "Budget draft"}
    assert [s["title"] for s in conn.execute("SELECT title FROM subtasks WHERE task_id = ? ORDER BY id", (task_id,))] == ["Numbers", "Charts"]
    assert client.get("/api/trash").json() == []


def test_restoring_a_goal_brings_back_milestones_and_task_links(conn):
    goal_id = goals.add_goal(conn, {"title": "Half marathon", "area": "fitness"}, "2026-10-24")
    goals.add_milestone(conn, goal_id, {"title": "14 km long run", "due_date": "2026-10-30"})
    task_id = tasks.add(conn, {"title": "Buy shoes", "goal_id": goal_id})
    trash_id = trash.capture(conn, "goal", goal_id)
    goals.delete_goal(conn, goal_id)
    assert conn.execute("SELECT goal_id FROM tasks WHERE id = ?", (task_id,)).fetchone()[0] is None

    trash.restore(conn, trash_id)
    assert conn.execute("SELECT COUNT(*) FROM milestones WHERE goal_id = ?", (goal_id,)).fetchone()[0] == 1
    assert conn.execute("SELECT goal_id FROM tasks WHERE id = ?", (task_id,)).fetchone()[0] == goal_id


def test_restore_uses_a_new_id_when_the_old_one_was_reused(conn):
    first = tasks.add(conn, {"title": "Old", "subtasks": ["Step"]})
    trash_id = trash.capture(conn, "task", first)
    tasks.delete(conn, first)
    reused = tasks.add(conn, {"title": "New"})  # SQLite may hand the freed id out again
    restored = trash.restore(conn, trash_id)
    assert {r["title"] for r in conn.execute("SELECT title FROM tasks")} == {"Old", "New"}
    assert conn.execute("SELECT task_id FROM subtasks").fetchone()[0] == restored["id"]
    assert restored["id"] != reused  # both exist again, under different ids


def test_a_milestone_needs_its_goal(conn):
    goal_id = goals.add_goal(conn, {"title": "Goal", "area": "career"}, "2026-10-24")
    m = goals.add_milestone(conn, goal_id, {"title": "Step", "due_date": None})
    m_trash = trash.capture(conn, "milestone", m)
    goals.delete_milestone(conn, m)
    goals.delete_goal(conn, goal_id)
    with pytest.raises(ValueError, match="restore the goal first"):
        trash.restore(conn, m_trash)


def test_chats_come_back_whole_and_busy_chats_cant_be_deleted(conn, client):
    chat_id = chats.create(conn, "Why am I tired?")
    chats.add_reply(conn, chat_id, "Sleep.")
    trash_id = trash.capture(conn, "chat", chat_id)
    chats.delete(conn, chat_id)
    trash.restore(conn, trash_id)
    assert len(chats.get(conn, chat_id)["messages"]) == 2

    with conn:
        conn.execute("INSERT INTO coach_jobs (skill, status, chat_id) VALUES ('ask', 'running', ?)", (chat_id,))
    assert client.request("DELETE", f"/api/chats/{chat_id}", json={}).status_code == 409


def test_trash_keeps_30_days_and_can_be_emptied(conn, client):
    task_id = tasks.add(conn, {"title": "Old task"})
    trash.capture(conn, "task", task_id)
    assert trash.purge(conn, datetime.now(timezone.utc) + timedelta(days=31)) == 1
    task_id = tasks.add(conn, {"title": "Another"})
    trash.capture(conn, "task", task_id)
    assert client.request("DELETE", "/api/trash", json={}).json() == []
    assert client.post("/api/trash/99/restore", json={}).status_code == 404
