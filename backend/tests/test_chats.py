import json
import sys
import time

import pytest
from fastapi.testclient import TestClient

from samuel import chats, cli, coach
from samuel.api import create_app
from samuel.reports import add_report


@pytest.fixture
def client():
    return TestClient(create_app(), base_url="http://127.0.0.1:8765")


def wait(client, chat_id):
    for _ in range(100):
        chat = client.get(f"/api/chats/{chat_id}").json()
        if not chat["pending"]:
            return chat
        time.sleep(0.1)
    raise AssertionError("still pending")


def fake_claude(tmp_path, reply="Sleep is the lever: 5 short nights, energy 4.2."):
    """A stand-in for Claude Code that reads the chat and replies through the samuel CLI, as the skill does."""
    fake = tmp_path / "fake_claude.py"
    fake.write_text(
        "import sys\n"
        "from samuel import cli\n"
        f"sys.stdin = __import__('io').StringIO({reply!r})\n"
        "cli.main(['report', 'add', '--kind', 'ask', '--chat', sys.argv[1]])\n",
        encoding="utf-8",
    )
    return lambda skill, chat_id=None: [sys.executable, str(fake), str(chat_id)]


def test_a_conversation_with_follow_ups(client, monkeypatch, tmp_path):
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    monkeypatch.setattr(coach, "command", fake_claude(tmp_path))

    chat = client.post("/api/chats", json={"text": "Why do I crash around 3pm?"}).json()
    assert chat["pending"] and chat["title"] == "Why do I crash around 3pm?"
    chat = wait(client, chat["id"])
    assert [m["role"] for m in chat["messages"]] == ["user", "samuel"]
    assert chat["messages"][1]["text"].startswith("Sleep is the lever")

    client.post(f"/api/chats/{chat['id']}/messages", json={"text": "What should I try first?"})
    chat = wait(client, chat["id"])
    assert [m["role"] for m in chat["messages"]] == ["user", "samuel", "user", "samuel"]
    assert client.get("/api/chats").json()[0]["messages"] == 4


def test_follow_up_waits_for_the_reply(conn, client, monkeypatch):
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    chat_id = chats.create(conn, "First question")
    with conn:
        conn.execute("INSERT INTO coach_jobs (skill, status, chat_id) VALUES ('ask', 'running', ?)", (chat_id,))
    r = client.post(f"/api/chats/{chat_id}/messages", json={"text": "And another"})
    assert r.status_code == 409 and "still answering" in r.json()["detail"]


def test_failed_reply_can_be_retried(client, monkeypatch, tmp_path):
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    monkeypatch.setattr(coach, "command", lambda skill, chat_id=None: [sys.executable, "-c", "pass"])
    chat = wait(client, client.post("/api/chats", json={"text": "Hello?"}).json()["id"])
    assert chat["error"] == "Claude Code finished without replying" and chat["awaiting_reply"]

    monkeypatch.setattr(coach, "command", fake_claude(tmp_path, "Here now."))
    client.post(f"/api/chats/{chat['id']}/retry", json={})
    chat = wait(client, chat["id"])
    assert chat["error"] is None and chat["messages"][-1]["text"] == "Here now."
    assert client.post(f"/api/chats/{chat['id']}/retry", json={}).status_code == 409


def test_chat_needs_claude_and_a_message(client, monkeypatch):
    monkeypatch.setattr(coach, "claude_path", lambda: None)
    assert client.post("/api/chats", json={"text": "Hi"}).status_code == 503
    monkeypatch.setattr(coach, "claude_path", lambda: "claude")
    assert client.post("/api/chats", json={"text": "   "}).status_code == 422
    assert client.post("/api/chats", json={"text": "x" * 2001}).status_code == 422
    assert client.get("/api/chats/99").status_code == 404
    # Ask runs only start from a chat, never from the report button.
    assert client.post("/api/coach/run", json={"skill": "ask"}).status_code == 422


def test_the_coach_sees_the_conversation_and_the_report(conn, capsys):
    report_id = add_report(conn, "daily", "# Daily report · Thursday", "2026-10-22")
    chat_id = chats.create(conn, "Which leak should I fix first?", report_id)
    cli.main(["export", "--since", "7d", "--chat", str(chat_id)])
    data = json.loads(capsys.readouterr().out)
    assert data["chat"]["about_report"]["markdown"] == "# Daily report · Thursday"
    assert data["chat"]["messages"][-1] == {**data["chat"]["messages"][-1], "role": "user",
                                            "text": "Which leak should I fix first?"}


def test_one_reply_per_question(conn):
    chat_id = chats.create(conn, "Question")
    chats.add_reply(conn, chat_id, "Answer")
    with pytest.raises(ValueError, match="no question waiting"):
        chats.add_reply(conn, chat_id, "A second, unasked answer")


def test_coach_runs_answer_with_the_chat_id():
    assert coach.command("ask", 12)[2] == "/ask 12"
    assert coach.command("daily-report")[2] == "/daily-report"


def test_deleting_a_chat_removes_its_messages(conn, client):
    chat_id = chats.create(conn, "Delete me")
    assert client.request("DELETE", f"/api/chats/{chat_id}", json={}).json() == []
    assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 0
