from fastapi.testclient import TestClient

from samuel import digest, routines, weekly
from samuel.api import create_app
from samuel.checkins import save_checkin


def test_focus_comes_from_last_nights_improvement_first(conn):
    save_checkin(conn, "2026-10-23", {"improvement": "Phone out of the bedroom"})
    assert digest.focus(conn, "2026-10-24") == {
        "text": "Phone out of the bedroom", "source": "Your improvement from last night's check-in"}


def test_focus_falls_back_to_this_weeks_top_priority_then_a_due_milestone(conn):
    # Saturday 24 Oct 2026: priorities set in the review of the week of 12 Oct apply to this week.
    weekly.save(conn, "2026-10-12", {}, ["", "Ship the budget draft"], [], "done", "2026-10-17")
    assert digest.focus(conn, "2026-10-24")["text"] == "Ship the budget draft"

    conn.execute("DELETE FROM weekly_reviews")
    with conn:
        g = conn.execute("INSERT INTO goals (title, area, created_at) VALUES ('Half marathon', 'fitness', '2026-09-01')").lastrowid
        conn.execute("INSERT INTO milestones (goal_id, title, due_date) VALUES (?, '14 km long run', '2026-10-22')", (g,))
    assert digest.focus(conn, "2026-10-24") == {"text": "14 km long run", "source": "Overdue · Half marathon"}

    conn.execute("DELETE FROM milestones")
    assert digest.focus(conn, "2026-10-24") is None


def test_due_lists_overdue_first_then_high_priority(conn):
    with conn:
        conn.executemany(
            "INSERT INTO tasks (title, priority, due_date, due_time) VALUES (?, ?, ?, ?)",
            [("Call the bank", "normal", "2026-10-24", "16:00"), ("Send invoice", "normal", "2026-10-22", None),
             ("Budget draft", "high", "2026-10-24", None), ("Next week thing", "normal", "2026-10-30", None)],
        )
    d = digest.digest(conn, "2026-10-24T10:00")
    assert [i["title"] for i in d["due"]["items"]] == ["Send invoice", "Budget draft", "Call the bank"]
    assert (d["due"]["overdue"], d["due"]["today"]) == (1, 2)


def test_next_block_is_now_or_next(conn):
    routines.add(conn, {"name": "Deep work", "start": "09:00", "end": "11:00"})
    routines.add(conn, {"name": "Workout", "start": "18:00", "end": "19:00"})
    assert digest.next_block(conn, "2026-10-24", "09:30")["state"] == "now"
    assert digest.next_block(conn, "2026-10-24", "12:00") == {"name": "Workout", "start": "18:00", "end": "19:00", "state": "next"}
    assert digest.next_block(conn, "2026-10-24", "20:00") is None


def test_digest_api():
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765")
    body = client.get("/api/digest?now=2026-10-24T15:10").json()
    assert body["now"] == "2026-10-24T15:10" and body["focus"] is None and body["yesterday"]["score"] is None
    assert client.get("/api/digest?now=yesterday").status_code == 422
