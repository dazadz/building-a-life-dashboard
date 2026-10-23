"""Routine blocks and today's plan built from them."""

import json
import re
import sqlite3
from datetime import date

from . import goals, settings

FIELDS = ("name", "start", "end", "weekdays", "note")
HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")


def validate(changes: dict) -> dict:
    clean = {}
    for key, value in changes.items():
        if key == "name":
            if not isinstance(value, str) or not value.strip() or len(value) > 80:
                raise ValueError("name must be 1 to 80 characters")
            value = value.strip()
        elif key in ("start", "end"):
            if not isinstance(value, str) or not HHMM.fullmatch(value):
                raise ValueError(f"{key} must be HH:MM")
        elif key == "weekdays":
            if not isinstance(value, list) or not value or any(not isinstance(d, int) or isinstance(d, bool) or not 0 <= d <= 6 for d in value):
                raise ValueError("pick at least one weekday")
            value = sorted(set(value))
        elif key == "note":
            if value is not None and (not isinstance(value, str) or len(value) > 200):
                raise ValueError("note must be at most 200 characters")
            value = (value or "").strip() or None
        else:
            raise ValueError(f"unknown field {key}")
        clean[key] = value
    return clean


def _row(r: sqlite3.Row) -> dict:
    return {**dict(r), "weekdays": json.loads(r["weekdays"])}


def list_routines(conn: sqlite3.Connection) -> list[dict]:
    return [_row(r) for r in conn.execute("SELECT * FROM routines ORDER BY start, id")]


def _exists(conn: sqlite3.Connection, routine_id: int) -> None:
    if conn.execute("SELECT 1 FROM routines WHERE id = ?", (routine_id,)).fetchone() is None:
        raise KeyError(routine_id)


def add(conn: sqlite3.Connection, fields: dict) -> int:
    clean = validate({k: v for k, v in fields.items() if k in FIELDS})
    if not {"name", "start", "end"} <= set(clean):
        raise ValueError("a block needs a name, a start and an end")
    clean.setdefault("weekdays", list(range(7)))
    clean["weekdays"] = json.dumps(clean["weekdays"])
    with conn:
        cur = conn.execute(
            f"INSERT INTO routines ({', '.join(clean)}) VALUES ({', '.join('?' * len(clean))})", list(clean.values()),
        )
    return cur.lastrowid


def update(conn: sqlite3.Connection, routine_id: int, changes: dict) -> None:
    _exists(conn, routine_id)
    clean = validate(changes)
    if "weekdays" in clean:
        clean["weekdays"] = json.dumps(clean["weekdays"])
    if clean:
        with conn:
            conn.execute(f"UPDATE routines SET {', '.join(f'{k} = ?' for k in clean)} WHERE id = ?", [*clean.values(), routine_id])


def delete(conn: sqlite3.Connection, routine_id: int) -> None:
    _exists(conn, routine_id)
    with conn:
        conn.execute("DELETE FROM routines WHERE id = ?", (routine_id,))


def _at(minutes: int) -> str:
    minutes %= 24 * 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def suggested(conn: sqlite3.Connection, today: str) -> list[dict]:
    """A starting routine from the user's wake-up and deep work targets."""
    t = settings.targets_on(conn, today)
    h, m = map(int, t["wake_target"].split(":"))
    wake = h * 60 + m
    deep = round(t["deep_work_target_hours"] * 60)
    first = min(deep, 120)
    second = max(deep - first, 0)
    weekdays, every_day = [0, 1, 2, 3, 4], list(range(7))
    blocks = [
        {"name": "Morning routine", "start": _at(wake), "end": _at(wake + 45), "weekdays": every_day, "note": "Water, light, plan the day"},
        {"name": "Deep work 1", "start": "09:00", "end": _at(9 * 60 + first), "weekdays": weekdays, "note": "Phone in another room"},
        {"name": "Recovery: lunch away from screens", "start": "12:30", "end": "13:15", "weekdays": every_day, "note": None},
        {"name": "Workout", "start": "18:00", "end": "19:00", "weekdays": [0, 2, 4, 5], "note": None},
        {"name": "Wind down", "start": _at(wake - round(t["sleep_target_hours"] * 60) - 30),
         "end": _at(wake - round(t["sleep_target_hours"] * 60)), "weekdays": every_day, "note": "Screens off, read"},
    ]
    if second:
        blocks.insert(3, {"name": "Deep work 2", "start": "14:00", "end": _at(14 * 60 + second), "weekdays": weekdays, "note": None})
    return blocks


def add_suggested(conn: sqlite3.Connection, today: str) -> None:
    if list_routines(conn):
        raise ValueError("you already have a routine")
    for block in suggested(conn, today):
        add(conn, block)


def plan(conn: sqlite3.Connection, day: str) -> dict:
    """Today's blocks in time order, and the milestones due today."""
    weekday = date.fromisoformat(day).weekday()
    blocks = [r for r in list_routines(conn) if weekday in r["weekdays"]]
    due = [m for m in goals.this_week(goals.list_goals(conn), day) if m["due_date"] == day]
    return {
        "date": day,
        "blocks": blocks,
        "due_today": [{"id": m["id"], "title": m["title"], "goal_title": m["goal_title"]} for m in due],
        "has_routine": bool(list_routines(conn)),
    }


def for_coach(conn: sqlite3.Connection) -> list[dict]:
    days = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    return [
        {"name": r["name"], "time": f"{r['start']}–{r['end']}", "days": [days[d] for d in r["weekdays"]], "note": r["note"]}
        for r in list_routines(conn)
    ]
