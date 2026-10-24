"""The Today digest at the top of Home: one focus, what's due, what's next, and how yesterday went.

Built for someone who opens Samuel on and off all day, so it reads the local time the app sends.
"""

import sqlite3
from datetime import date, timedelta

from . import goals, routines, scores, tasks, weekly

DUE_ITEMS = 4


def focus(conn: sqlite3.Connection, today: str) -> dict | None:
    """The one thing to keep in mind today, from the user's own words first."""
    yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    row = scores.checkin_row(conn, yesterday)
    if row and (row.get("improvement") or "").strip():
        return {"text": row["improvement"].strip(), "source": "Your improvement from last night's check-in"}
    last_week = (date.fromisoformat(weekly.monday(today)) - timedelta(days=7)).isoformat()
    saved = weekly._saved(conn, last_week)
    top = next((p for p in (saved or {}).get("priorities", []) if p and p.strip()), None)
    if top:
        return {"text": top.strip(), "source": "Your top priority this week"}
    due = [m for m in goals.this_week(goals.list_goals(conn), today) if m["due_date"] <= today]
    if due:
        m = due[0]
        return {"text": m["title"], "source": f"{'Overdue' if m['overdue'] else 'Due today'} · {m['goal_title']}"}
    return None


def next_block(conn: sqlite3.Connection, today: str, hhmm: str) -> dict | None:
    for b in routines.plan(conn, today)["blocks"]:
        crosses = b["end"] <= b["start"]  # e.g. 23:30–00:30 runs until after midnight
        if b["start"] <= hhmm and (crosses or hhmm < b["end"]):
            return {"name": b["name"], "start": b["start"], "end": b["end"], "state": "now"}
        if b["start"] > hhmm:
            return {"name": b["name"], "start": b["start"], "end": b["end"], "state": "next"}
    return None


def digest(conn: sqlite3.Connection, now: str) -> dict:
    today, hhmm = now[:10], now[11:16]
    open_tasks = [t for t in tasks.summary(conn, now)["tasks"] if t["view"] in ("overdue", "today")]
    open_tasks.sort(key=lambda t: (t["view"] != "overdue", t["priority"] != "high", t["due_time"] or "99:99", t["id"]))
    milestones = [m for m in goals.this_week(goals.list_goals(conn), today) if m["due_date"] <= today]
    yesterday = (date.fromisoformat(today) - timedelta(days=1)).isoformat()
    y = scores.summary(conn, yesterday)
    return {
        "now": now,
        "focus": focus(conn, today),
        "due": {
            "overdue": sum(1 for t in open_tasks if t["view"] == "overdue") + sum(1 for m in milestones if m["overdue"]),
            "today": sum(1 for t in open_tasks if t["view"] == "today") + sum(1 for m in milestones if not m["overdue"]),
            "items": ([{"kind": "task", "id": t["id"], "title": t["title"], "time": t["due_time"],
                        "overdue": t["view"] == "overdue", "high": t["priority"] == "high"} for t in open_tasks]
                      + [{"kind": "milestone", "id": m["id"], "title": m["title"], "time": None,
                          "overdue": m["overdue"], "high": False} for m in milestones])[:DUE_ITEMS],
        },
        "next": next_block(conn, today, hhmm),
        "yesterday": {"date": yesterday, "score": y["scores"]["day"], "change": y["change"]["day"]},
    }
