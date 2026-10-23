from fastapi.testclient import TestClient

from samuel import chats, search
from samuel.api import create_app
from samuel.checkins import save_checkin
from samuel.reports import add_report


def fill(conn):
    with conn:
        conn.execute("INSERT INTO tasks (title, list, priority, due_date) VALUES ('Add hiring costs to Q4 budget', 'Work', 'high', '2026-10-24')")
        goal = conn.execute("INSERT INTO goals (title, area, created_at) VALUES ('Promotion to senior analyst', 'career', '2026-09-01')").lastrowid
        conn.execute("INSERT INTO milestones (goal_id, title, due_date) VALUES (?, 'Ship Q4 budget proposal', '2026-10-30')", (goal,))
    save_checkin(conn, "2026-10-22", {"failures": "The budget meeting ran long, so I lost the afternoon focus block"})
    add_report(conn, "daily", "# Daily report · Thursday 22 October\n\nThe budget meeting cost you 2 h.", "2026-10-22")
    chats.create(conn, "How do I stop budget meetings eating my day?")


def test_search_finds_everything_that_mentions_the_words(conn):
    fill(conn)
    groups = {g["name"]: g["items"] for g in search.search(conn, "budget")["groups"]}
    assert list(groups) == ["Tasks", "Goals", "Check-ins", "Reports", "Chats"]
    assert groups["Tasks"][0]["meta"] == "2026-10-24 · Work · High priority"
    assert groups["Goals"][0]["meta"] == "Milestone of Promotion to senior analyst · due 2026-10-30"
    assert groups["Check-ins"][0]["meta"].startswith("Failures: “The budget meeting")
    assert groups["Check-ins"][0]["href"] == "#/checkin?date=2026-10-22"
    assert groups["Reports"][0]["title"] == "Daily report · Thursday 22 October"
    assert groups["Chats"][0]["href"].startswith("#/coach?chat=")


def test_search_needs_two_characters_and_treats_wildcards_as_text(conn):
    fill(conn)
    assert search.search(conn, "b")["groups"] == []
    assert search.search(conn, "%%")["groups"] == []
    assert search.search(conn, "no such thing")["groups"] == []


def test_snippet_centres_on_the_match():
    text = "a" * 200 + " budget " + "b" * 200
    s = search.snippet(text, "budget")
    assert "budget" in s and s.startswith("…") and s.endswith("…")


def test_search_api():
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765")
    assert client.get("/api/search?q=budget").json() == {"query": "budget", "groups": []}
