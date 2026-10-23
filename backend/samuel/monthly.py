"""Monthly evolution: a calendar month compared with the one before (see docs/scores.md)."""

import calendar
import sqlite3
from datetime import date, timedelta

from . import goals, habits, scores


def parse_month(month: str) -> date:
    """'2026-10' to the first of that month. Raises ValueError for anything else."""
    try:
        y, m = month.split("-")
        return date(int(y), int(m), 1)
    except (ValueError, TypeError):
        raise ValueError("month must be YYYY-MM")


def previous(month: date) -> date:
    return (month - timedelta(days=1)).replace(day=1)


def _days(month: date, today: str) -> list[str]:
    last = calendar.monthrange(month.year, month.month)[1]
    out = [date(month.year, month.month, d).isoformat() for d in range(1, last + 1)]
    return [d for d in out if d <= today]


def _avg(xs: list[float], digits: int = 0) -> float | None:
    if not xs:
        return None
    value = sum(xs) / len(xs)
    return round(value) if digits == 0 else round(value, digits)


def numbers(conn: sqlite3.Connection, month: date, today: str) -> dict:
    days = _days(month, today)
    daily = [scores.scores_for(conn, d) for d in days]
    checkins = [c for c in (scores.checkin_row(conn, d) for d in days) if c]
    sleep = [c["sleep_hours"] for c in checkins if c["sleep_hours"] is not None]
    statuses = [s for d in days for s in scores.habit_statuses(conn, d).values()]
    first, last = (days[0], days[-1]) if days else (None, None)
    due = [
        m for g in goals.list_goals(conn) for m in g["milestones"]
        if first and m["due_date"] and first <= m["due_date"] <= last
    ]
    done = sum(1 for m in due if m["done_date"])
    return {
        "days_in_month": calendar.monthrange(month.year, month.month)[1],
        "days_so_far": len(days),
        "days_logged": len(checkins),
        "discipline": _avg([s["discipline"] for s in daily if s["discipline"] is not None]),
        "productivity": _avg([s["productivity"] for s in daily if s["productivity"] is not None]),
        "energy": _avg([s["energy"] for s in daily if s["energy"] is not None]),
        "consistency": habits.rate(statuses),
        "sleep": _avg(sleep, 1),
        "milestones_done": done,
        "milestones_due": len(due),
        "goal_completion": round(100 * done / len(due)) if due else None,
    }


def habit_rates(conn: sqlite3.Connection, month: date, today: str) -> dict[str, int | None]:
    days = _days(month, today)
    by_habit: dict[str, list[str]] = {}
    for d in days:
        for key, status in scores.habit_statuses(conn, d).items():
            by_habit.setdefault(key, []).append(status)
    return {key: habits.rate(statuses) for key, statuses in by_habit.items()}


def trend(conn: sqlite3.Connection, month: date, today: str) -> list[dict]:
    out, seen = [], []
    for d in _days(month, today):
        value = scores.scores_for(conn, d)["discipline"]
        if value is not None:
            seen.append((d, value))
        recent = [v for day, v in seen if day > (date.fromisoformat(d) - timedelta(days=7)).isoformat()]
        out.append({"date": d, "discipline": value, "average": _avg(recent)})
    return out


def _change(now, then):
    return None if now is None or then is None else round(now - then, 1)


def summary(conn: sqlite3.Connection, month: str, today: str) -> dict:
    this = parse_month(month)
    last = previous(this)
    now_n, then_n = numbers(conn, this, today), numbers(conn, last, today)
    names = {r["key"]: r["name"] for r in conn.execute("SELECT key, name FROM habits WHERE archived = 0 ORDER BY position")}
    now_h, then_h = habit_rates(conn, this, today), habit_rates(conn, last, today)
    return {
        "month": this.strftime("%Y-%m"),
        "previous": last.strftime("%Y-%m"),
        "is_current": this.strftime("%Y-%m") == today[:7],
        "numbers": now_n,
        "previous_numbers": then_n,
        "changes": {k: _change(now_n[k], then_n[k]) for k in ("discipline", "productivity", "energy", "consistency", "sleep", "goal_completion")},
        "habits": [
            {"key": k, "name": name, "now": now_h.get(k), "then": then_h.get(k), "change": _change(now_h.get(k), then_h.get(k))}
            for k, name in names.items()
        ],
        "trend": trend(conn, this, today),
    }


def for_coach(conn: sqlite3.Connection, today: str) -> dict:
    s = summary(conn, today[:7], today)
    return {
        "month": s["month"], "numbers": s["numbers"], "previous_month": s["previous"],
        "previous_numbers": s["previous_numbers"], "changes": s["changes"],
        "habits": [{"name": h["name"], "this_month": h["now"], "last_month": h["then"]} for h in s["habits"]],
    }
