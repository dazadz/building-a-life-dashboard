"""Rule-based scores. Every rule here is written down in docs/scores.md; change that file first.

Missing data is None and is never counted as 0.
"""

import sqlite3
from datetime import date, timedelta

from . import db

MOOD = {"low": 0.0, "flat": 0.25, "okay": 0.5, "good": 0.75, "great": 1.0}
SCORE_NAMES = ("productivity", "focus", "energy", "discipline", "balance")


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def inputs(checkin: dict | None, habits: dict[str, str], targets: dict) -> dict:
    """Turn raw answers into values from 0 to 1 (see the Inputs table)."""
    c = checkin or {}
    sleep_t = targets["sleep_target_hours"]
    deep_t = targets["deep_work_target_hours"]
    v: dict[str, float | None] = {}

    v["sleep"] = None if c.get("sleep_hours") is None else _clamp(c["sleep_hours"] / sleep_t)
    if c.get("wake_time"):
        off = abs(_minutes(c["wake_time"]) - _minutes(targets["wake_target"]))
        v["wake"] = 1.0 if off <= 15 else _clamp((90 - off) / 75)
    else:
        v["wake"] = None
    v["mood"] = MOOD.get(c.get("mood"))
    v["energy"] = None if c.get("energy") is None else (c["energy"] - 1) / 9
    v["productivity"] = None if c.get("productivity") is None else (c["productivity"] - 1) / 9
    dw = c.get("deep_work_hours")
    v["deep_work"] = None if dw is None else _clamp(dw / deep_t)
    v["overwork"] = None if dw is None else _clamp((deep_t + 5 - dw) / 3)
    v["workout_balance"] = {"yes": 1.0, "rest": 1.0, "no": 0.0}.get(c.get("workout"))

    for key, status in habits.items():
        v[f"habit:{key}"] = {"done": 1.0, "missed": 0.0}.get(status)
    return v


def weighted(parts: list[tuple[float | None, float]]) -> float | None:
    """Weighted average of the parts that have data, or None if they carry under half the weight."""
    total = sum(w for _, w in parts)
    have = [(x, w) for x, w in parts if x is not None]
    weight = sum(w for _, w in have)
    if weight < total / 2:
        return None
    return sum(x * w for x, w in have) / weight


def _pct(x: float | None) -> int | None:
    return None if x is None else round(100 * x)


def daily_scores(checkin: dict | None, habits: dict[str, str], targets: dict) -> dict:
    v = inputs(checkin, habits, targets)
    logged = [s for s in habits.values() if s in ("done", "missed")]

    s = {
        "productivity": _pct(weighted([(v["productivity"], 0.5), (v["deep_work"], 0.5)])),
        "focus": _pct(weighted([
            (v["deep_work"], 0.5),
            (v.get("habit:no_procrastination"), 0.25),
            (v.get("habit:no_social_media"), 0.25),
        ])),
        "energy": _pct(weighted([(v["energy"], 0.5), (v["sleep"], 0.3), (v["mood"], 0.2)])),
        "discipline": _pct(logged.count("done") / len(logged)) if logged else None,
        "balance": _pct(weighted([
            (v["sleep"], 0.25), (v["workout_balance"], 0.25), (v["overwork"], 0.25), (v["mood"], 0.25),
        ])),
    }
    core = [s[k] for k in ("productivity", "discipline", "energy", "focus") if s[k] is not None]
    s["day"] = round(sum(core) / len(core)) if len(core) >= 2 else None

    strain = weighted([
        (None if v["mood"] is None else 1 - v["mood"], 0.4),
        (None if v["energy"] is None else 1 - v["energy"], 0.3),
        (None if v["sleep"] is None else 1 - v["sleep"], 0.3),
    ])
    s["stress"] = None if strain is None else round(1 + 9 * strain, 1)
    return s


# Reading from the database

def targets(conn: sqlite3.Connection) -> dict:
    st = db.settings(conn)
    return {k: st[k] for k in ("sleep_target_hours", "deep_work_target_hours", "wake_target")}


def habit_statuses(conn: sqlite3.Connection, day: str) -> dict[str, str]:
    rows = conn.execute(
        "SELECT h.key, l.status FROM habit_logs l JOIN habits h ON h.id = l.habit_id WHERE l.date = ?",
        (day,),
    )
    return {r["key"]: r["status"] for r in rows}


def checkin_row(conn: sqlite3.Connection, day: str) -> dict | None:
    row = conn.execute("SELECT * FROM checkins WHERE date = ?", (day,)).fetchone()
    return dict(row) if row else None


def scores_for(conn: sqlite3.Connection, day: str) -> dict:
    return daily_scores(checkin_row(conn, day), habit_statuses(conn, day), targets(conn))


def _days_before(day: str, n: int) -> list[str]:
    d = date.fromisoformat(day)
    return [(d - timedelta(days=i)).isoformat() for i in range(1, n + 1)]


def change_vs_last_week(conn: sqlite3.Connection, day: str, today: dict) -> dict:
    """Today's score minus the average of the previous 7 days that have that score."""
    previous = [scores_for(conn, d) for d in _days_before(day, 7)]
    out = {}
    for k in (*SCORE_NAMES, "day"):
        vals = [p[k] for p in previous if p[k] is not None]
        out[k] = None if today[k] is None or not vals else round(today[k] - sum(vals) / len(vals))
    return out


def consistency(conn: sqlite3.Connection, day: str) -> int | None:
    """Share of logged habit-days done over the 7 days ending on `day`; needs 3 days with logs."""
    start = (date.fromisoformat(day) - timedelta(days=6)).isoformat()
    rows = conn.execute(
        "SELECT date, status FROM habit_logs WHERE date BETWEEN ? AND ? AND status IN ('done', 'missed')",
        (start, day),
    ).fetchall()
    if len({r["date"] for r in rows}) < 3:
        return None
    return round(100 * sum(r["status"] == "done" for r in rows) / len(rows))


def checkin_streak(conn: sqlite3.Connection, day: str) -> int:
    dates = {r["date"] for r in conn.execute("SELECT date FROM checkins")}
    d = date.fromisoformat(day)
    if d.isoformat() not in dates:
        d -= timedelta(days=1)
    streak = 0
    while d.isoformat() in dates:
        streak += 1
        d -= timedelta(days=1)
    return streak


def summary(conn: sqlite3.Connection, day: str) -> dict:
    today = scores_for(conn, day)
    return {
        "date": day,
        "scores": today,
        "change": change_vs_last_week(conn, day, today),
        "consistency": consistency(conn, day),
        "checkin_streak": checkin_streak(conn, day),
    }
