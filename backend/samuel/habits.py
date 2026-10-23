"""Habit history: streaks, rates, weekly consistency and failure patterns (see docs/scores.md)."""

import sqlite3
from datetime import date, timedelta

WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _iso(d: date) -> str:
    return d.isoformat()


def streak(logs: dict[str, str], end: date) -> int:
    """Consecutive done days back from `end`, or from the day before if `end` isn't logged yet.

    An unlogged or missed day ends the streak; a skipped day is passed over.
    """
    d = end if _iso(end) in logs else end - timedelta(days=1)
    count = 0
    while True:
        status = logs.get(_iso(d))
        if status == "done":
            count += 1
        elif status != "skipped":
            return count
        d -= timedelta(days=1)


def best_streak(logs: dict[str, str]) -> int:
    if not logs:
        return 0
    d, last = date.fromisoformat(min(logs)), date.fromisoformat(max(logs))
    best = run = 0
    while d <= last:
        status = logs.get(_iso(d))
        if status == "done":
            run += 1
            best = max(best, run)
        elif status != "skipped":
            run = 0
        d += timedelta(days=1)
    return best


def rate(statuses: list[str | None]) -> int | None:
    """Share of logged days done, as a %. None when nothing was logged."""
    logged = [s for s in statuses if s in ("done", "missed")]
    return round(100 * logged.count("done") / len(logged)) if logged else None


def weekly_consistency(all_logs: dict[str, dict[str, str]], end: date, weeks: int = 8) -> list[dict]:
    monday = end - timedelta(days=end.weekday())
    out = []
    for w in range(weeks - 1, -1, -1):
        start = monday - timedelta(weeks=w)
        days = [_iso(start + timedelta(days=i)) for i in range(7)]
        statuses = [logs.get(d) for logs in all_logs.values() for d in days]
        logged_days = {d for logs in all_logs.values() for d in days if logs.get(d) in ("done", "missed")}
        out.append({
            "week_start": _iso(start),
            "consistency": rate(statuses) if len(logged_days) >= 3 else None,
        })
    return out


def patterns(all_logs: dict[str, dict[str, str]], names: dict[str, str], end: date) -> list[dict]:
    """Habit and weekday pairs missed on at least 3 of the last 4 logged occurrences in 8 weeks."""
    found = []
    for key, logs in all_logs.items():
        for wd in range(7):
            # Most recent matching weekday on or before `end`, going back 8 weeks.
            d = end - timedelta(days=(end.weekday() - wd) % 7)
            seen = []
            for _ in range(8):
                status = logs.get(_iso(d))
                if status in ("done", "missed"):
                    seen.append(status)
                if len(seen) == 4:
                    break
                d -= timedelta(weeks=1)
            missed = seen.count("missed")
            if len(seen) >= 3 and missed >= 3:
                found.append({
                    "key": key, "name": names[key], "weekday": WEEKDAYS[wd],
                    "missed": missed, "of": len(seen),
                })
    return sorted(found, key=lambda p: (-p["missed"] / p["of"], p["name"]))


def history(conn: sqlite3.Connection, end: str, days: int) -> dict:
    end_d = date.fromisoformat(end)
    dates = [_iso(end_d - timedelta(days=i)) for i in range(days - 1, -1, -1)]
    habits = [dict(r) for r in conn.execute(
        "SELECT id, key, name, auto FROM habits WHERE archived = 0 ORDER BY position"
    )]
    all_logs: dict[str, dict[str, str]] = {h["key"]: {} for h in habits}
    for r in conn.execute(
        "SELECT h.key, l.date, l.status FROM habit_logs l JOIN habits h ON h.id = l.habit_id "
        "WHERE h.archived = 0 AND l.date <= ?", (end,)
    ):
        all_logs[r["key"]][r["date"]] = r["status"]

    rows = []
    for h in habits:
        logs = all_logs[h["key"]]
        rows.append({
            "key": h["key"], "name": h["name"], "auto": h["auto"],
            "days": [logs.get(d) for d in dates],
            "streak": streak(logs, end_d),
            "best": best_streak(logs),
            "rate": rate([logs.get(d) for d in dates]),
        })
    period = [s for r in rows for s in r["days"]]
    return {
        "end": end,
        "dates": dates,
        "habits": rows,
        "consistency": rate(period),
        "weekly": weekly_consistency(all_logs, end_d),
        "patterns": patterns(all_logs, {h["key"]: h["name"] for h in habits}, end_d),
    }
