"""The weekly review: look back on the week, reflect, and plan the next one.

Everything here comes straight from the user's data (see "Weekly review" in docs/scores.md).
Samuel's written brief is a separate coach report from the weekly-review skill.
"""

import json
import sqlite3
from datetime import date, timedelta

from . import goals, habits, scores

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def monday(day: str) -> str:
    d = date.fromisoformat(day)
    return (d - timedelta(days=d.weekday())).isoformat()


def default_week(today: str) -> str:
    """From Friday on, review this week; earlier in the week, the one that just ended."""
    d = date.fromisoformat(today)
    return monday(today) if d.weekday() >= 4 else monday((d - timedelta(days=7)).isoformat())


def _days(week_start: str) -> list[str]:
    start = date.fromisoformat(week_start)
    return [(start + timedelta(days=i)).isoformat() for i in range(7)]


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 1) if values else None


def numbers(conn: sqlite3.Connection, week_start: str) -> dict:
    days = _days(week_start)
    checkins = [c for c in (scores.checkin_row(conn, d) for d in days) if c]
    day_scores = [s for s in (scores.scores_for(conn, d)["day"] for d in days) if s is not None]
    prev = [s for s in (scores.scores_for(conn, d)["day"] for d in _days(
        (date.fromisoformat(week_start) - timedelta(days=7)).isoformat())) if s is not None]
    statuses = [s for d in days for s in scores.habit_statuses(conn, d).values()]
    sleep = [c["sleep_hours"] for c in checkins if c["sleep_hours"] is not None]
    deep = [c["deep_work_hours"] for c in checkins if c["deep_work_hours"] is not None]
    score = round(_avg(day_scores)) if day_scores else None
    return {
        "day_score": score,
        "day_score_change": score - round(_avg(prev)) if score is not None and prev else None,
        "checkins": len(checkins),
        "sleep_avg": _avg(sleep),
        "deep_work_total": round(sum(deep), 1) if deep else None,
        "habit_rate": habits.rate(statuses),
        "workouts": sum(1 for c in checkins if c["workout"] == "yes"),
    }


def _milestones(conn: sqlite3.Connection) -> list[dict]:
    return [
        {**m, "goal_title": g["title"]}
        for g in goals.list_goals(conn) if not g["done_date"]
        for m in g["milestones"]
    ]


def _past_due(m: dict, week_start: str, today: str) -> bool:
    """An open milestone that was due this week and whose due date has passed."""
    return not m["done_date"] and bool(m["due_date"]) and m["due_date"] < today and m["due_date"] <= _days(week_start)[-1]


def look_back(conn: sqlite3.Connection, week_start: str, today: str) -> dict:
    days = _days(week_start)
    end = days[-1]
    wins, slipped = [], []
    for d in days:
        c = scores.checkin_row(conn, d)
        if c and (c["wins"] or "").strip():
            wins.append({"date": d, "text": c["wins"].strip()})
        if c and (c["failures"] or "").strip():
            slipped.append({"date": d, "text": c["failures"].strip()})
    for m in _milestones(conn):
        if m["done_date"] and week_start <= m["done_date"] <= end:
            wins.append({"date": m["done_date"], "text": f"{m['title']} ({m['goal_title']})"})
        elif _past_due(m, week_start, today) and m["due_date"] >= week_start:
            slipped.append({"date": m["due_date"], "text": f"{m['title']} ({m['goal_title']}) is still open"})
    return {"wins": sorted(wins, key=lambda w: w["date"]), "slipped": sorted(slipped, key=lambda s: s["date"])}


def questions(conn: sqlite3.Connection, week_start: str, today: str) -> list[dict]:
    """Three questions from the week's own data, or general ones when there's little data."""
    days = _days(week_start)
    rows = [(d, scores.checkin_row(conn, d)) for d in days]
    rows = [(d, c) for d, c in rows if c]
    out = []
    focus = [(c["deep_work_hours"], d) for d, c in rows if c["deep_work_hours"]]
    if focus:
        hours, d = max(focus)
        out.append({"key": "best_day", "question": f"{WEEKDAYS[date.fromisoformat(d).weekday()]} was your best focus day ({hours} h). What made it work?"})
    else:
        out.append({"key": "best_day", "question": "Which day went best this week, and what made it work?"})
    open_ = [m for m in _milestones(conn) if _past_due(m, week_start, today)]
    energy = [(c["energy"], d) for d, c in rows if c["energy"]]
    if open_:
        m = sorted(open_, key=lambda m: m["due_date"])[0]
        out.append({"key": "slipped", "question": f"{m['title']} slipped. Keep it, move it, or drop it?"})
    elif energy:
        level, d = min(energy)
        out.append({"key": "slipped", "question": f"Energy was lowest on {WEEKDAYS[date.fromisoformat(d).weekday()]} ({level}/10). What drained it?"})
    else:
        out.append({"key": "slipped", "question": "What slipped this week, and why?"})
    out.append({"key": "differently", "question": "What's one thing you'd do differently next week?"})
    return out


def _saved(conn: sqlite3.Connection, week_start: str) -> dict | None:
    row = conn.execute("SELECT * FROM weekly_reviews WHERE week_start = ?", (week_start,)).fetchone()
    if row is None:
        return None
    return {
        "questions": json.loads(row["questions"]), "priorities": json.loads(row["priorities"]),
        "carry": json.loads(row["carry"]), "status": row["status"], "updated_at": row["updated_at"],
    }


def review(conn: sqlite3.Connection, week_start: str, today: str) -> dict:
    week_start = monday(week_start)
    days = _days(week_start)
    saved = _saved(conn, week_start)
    asked = saved["questions"] if saved and saved["questions"] else [{**q, "answer": None} for q in questions(conn, week_start, today)]
    next_start = (date.fromisoformat(week_start) + timedelta(days=7)).isoformat()
    next_end = (date.fromisoformat(next_start) + timedelta(days=6)).isoformat()
    open_ = [m for m in _milestones(conn) if not m["done_date"]]
    carried = set(saved["carry"]) if saved else set()
    carry_over = [
        {"id": m["id"], "title": m["title"], "goal_title": m["goal_title"], "due_date": m["due_date"], "carry": m["id"] in carried}
        for m in sorted(open_, key=lambda m: m["due_date"] or "")
        if _past_due(m, week_start, today)
    ]
    coming_up = [
        {"id": m["id"], "title": m["title"], "goal_title": m["goal_title"], "due_date": m["due_date"]}
        for m in sorted(open_, key=lambda m: m["due_date"] or "")
        if m["due_date"] and next_start <= m["due_date"] <= next_end
    ]
    return {
        "week_start": week_start,
        "week_end": days[-1],
        "week_number": date.fromisoformat(week_start).isocalendar().week,
        "is_current": week_start == monday(today),
        "numbers": numbers(conn, week_start),
        **look_back(conn, week_start, today),
        "questions": asked,
        "priorities": (saved["priorities"] if saved else []) + [""] * (3 - len(saved["priorities"] if saved else [])),
        "carry_over": carry_over,
        "coming_up": coming_up,
        "status": saved["status"] if saved else None,
        "updated_at": saved["updated_at"] if saved else None,
    }


def save(conn: sqlite3.Connection, week_start: str, answers: dict, priorities: list, carry: list, status: str,
         today: str) -> None:
    if monday(week_start) != week_start:
        raise ValueError("week_start must be a Monday")
    if status not in ("draft", "done"):
        raise ValueError("status must be draft or done")
    if len(priorities) > 3 or any(not isinstance(p, str) or len(p) > 200 for p in priorities):
        raise ValueError("up to 3 priorities of at most 200 characters")
    if any(not isinstance(a, str) or len(a) > 2000 for a in answers.values()):
        raise ValueError("answers are text of at most 2000 characters")
    current = review(conn, week_start, today)
    known = {q["key"] for q in current["questions"]}
    if set(answers) - known:
        raise ValueError("unknown question")
    asked = [{"key": q["key"], "question": q["question"], "answer": (answers.get(q["key"], q["answer"]) or "").strip() or None}
             for q in current["questions"]]
    allowed = {m["id"] for m in current["carry_over"]}
    carried = [i for i in carry if i in allowed]
    with conn:
        conn.execute(
            "INSERT INTO weekly_reviews (week_start, questions, priorities, carry, status) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT (week_start) DO UPDATE SET questions = excluded.questions, priorities = excluded.priorities, "
            "carry = excluded.carry, status = excluded.status, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
            (week_start, json.dumps(asked), json.dumps([p.strip() for p in priorities if p.strip()]), json.dumps(carried), status),
        )


def for_coach(conn: sqlite3.Connection, today: str) -> dict | None:
    """The review of the week being reviewed, if the user has saved one."""
    week = default_week(today)
    if _saved(conn, week) is None:
        return None
    r = review(conn, week, today)
    return {
        "week_start": r["week_start"], "week_end": r["week_end"], "status": r["status"],
        "reflections": [{"question": q["question"], "answer": q["answer"]} for q in r["questions"]],
        "priorities_next_week": [p for p in r["priorities"] if p],
        "carry_over": [m["title"] for m in r["carry_over"] if m["carry"]],
    }
