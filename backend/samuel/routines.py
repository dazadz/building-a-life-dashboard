"""Routine blocks, day types and today's plan built from them.

A block repeats every week. With a day type (e.g. "Office day") it runs on the days of that type;
without one it runs on its own weekdays. A date can be switched to another day type for one day.
Blocks may cross midnight (an end before the start, e.g. 23:30–00:30).
"""

import json
import re
import sqlite3
from datetime import date, timedelta

from . import goals, settings

FIELDS = ("name", "start", "end", "weekdays", "note", "kind", "goal_id", "habit_key", "steps",
          "remind_before", "remind_start", "day_type_id")
KINDS = ("focus", "fixed", "habit", "recovery", "leisure")
HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
STEPS_MAX = 8
STEP_MAX = 120
HEADS_UP_MINUTES = 5
START_WINDOW_MINUTES = 15  # a start reminder shows only this long after the start, not hours later
DAY_TYPE_NAME_MAX = 40
ROLL_LOOKBACK_DAYS = 60


def _exists_in(conn: sqlite3.Connection, table: str, column: str, value) -> bool:
    return conn.execute(f"SELECT 1 FROM {table} WHERE {column} = ?", (value,)).fetchone() is not None


def _weekdays(value) -> list[int]:
    if not isinstance(value, list) or any(not isinstance(d, int) or isinstance(d, bool) or not 0 <= d <= 6 for d in value):
        raise ValueError("weekdays are numbers from 0 (Monday) to 6 (Sunday)")
    return sorted(set(value))


def validate(changes: dict, conn: sqlite3.Connection | None = None) -> dict:
    """Check block fields. Links (goal, habit, day type) are checked when a connection is given."""
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
            value = _weekdays(value)
            if not value:
                raise ValueError("pick at least one weekday")
        elif key == "note":
            if value is not None and (not isinstance(value, str) or len(value) > 200):
                raise ValueError("note must be at most 200 characters")
            value = (value or "").strip() or None
        elif key == "kind":
            if value not in KINDS:
                raise ValueError(f"kind must be one of {', '.join(KINDS)}")
        elif key == "steps":
            if (not isinstance(value, list) or len(value) > STEPS_MAX
                    or any(not isinstance(s, str) or not s.strip() or len(s.strip()) > STEP_MAX for s in value)):
                raise ValueError(f"up to {STEPS_MAX} steps of 1 to {STEP_MAX} characters")
            value = [s.strip() for s in value]
        elif key in ("remind_before", "remind_start"):
            if not isinstance(value, bool):
                raise ValueError(f"{key} must be true or false")
            value = int(value)
        elif key in ("goal_id", "habit_key", "day_type_id"):
            table, column = {"goal_id": ("goals", "id"), "habit_key": ("habits", "key"), "day_type_id": ("day_types", "id")}[key]
            if value is not None and conn is not None and not _exists_in(conn, table, column, value):
                raise ValueError(f"no such {table[:-1].replace('_', ' ')}")
        else:
            raise ValueError(f"unknown field {key}")
        clean[key] = value
    if "start" in clean and "end" in clean and clean["start"] == clean["end"]:
        raise ValueError("a block can't start and end at the same time")
    return clean


def _row(r: sqlite3.Row) -> dict:
    out = dict(r)
    out["weekdays"] = json.loads(r["weekdays"])
    out["steps"] = json.loads(r["steps"])
    out["remind_before"] = bool(r["remind_before"])
    out["remind_start"] = bool(r["remind_start"])
    return out


def list_routines(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT r.*, g.title AS goal_title, h.name AS habit_name, d.name AS day_type
           FROM routines r
           LEFT JOIN goals g ON g.id = r.goal_id
           LEFT JOIN habits h ON h.key = r.habit_key
           LEFT JOIN day_types d ON d.id = r.day_type_id
           ORDER BY r.start, r.id"""
    )
    return [_row(r) for r in rows]


def _exists(conn: sqlite3.Connection, routine_id: int) -> dict:
    row = conn.execute("SELECT * FROM routines WHERE id = ?", (routine_id,)).fetchone()
    if row is None:
        raise KeyError(routine_id)
    return dict(row)


def _encode(clean: dict) -> dict:
    out = dict(clean)
    for key in ("weekdays", "steps"):
        if key in out:
            out[key] = json.dumps(out[key])
    return out


def add(conn: sqlite3.Connection, fields: dict) -> int:
    clean = validate({k: v for k, v in fields.items() if k in FIELDS}, conn)
    if not {"name", "start", "end"} <= set(clean):
        raise ValueError("a block needs a name, a start and an end")
    clean.setdefault("weekdays", list(range(7)))
    clean = _encode(clean)
    with conn:
        cur = conn.execute(
            f"INSERT INTO routines ({', '.join(clean)}) VALUES ({', '.join('?' * len(clean))})", list(clean.values()),
        )
    return cur.lastrowid


def update(conn: sqlite3.Connection, routine_id: int, changes: dict) -> None:
    current = _exists(conn, routine_id)
    clean = validate(changes, conn)
    if clean.get("start", current["start"]) == clean.get("end", current["end"]):
        raise ValueError("a block can't start and end at the same time")
    clean = _encode(clean)
    if clean:
        with conn:
            conn.execute(f"UPDATE routines SET {', '.join(f'{k} = ?' for k in clean)} WHERE id = ?", [*clean.values(), routine_id])


def delete(conn: sqlite3.Connection, routine_id: int) -> None:
    _exists(conn, routine_id)
    with conn:
        conn.execute("DELETE FROM routines WHERE id = ?", (routine_id,))


# Day types

def list_day_types(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT d.*, (SELECT COUNT(*) FROM routines r WHERE r.day_type_id = d.id) AS blocks
           FROM day_types d ORDER BY d.position, d.id"""
    )
    return [{**dict(r), "weekdays": json.loads(r["weekdays"])} for r in rows]


def _day_type_name(conn: sqlite3.Connection, name, day_type_id: int | None = None) -> str:
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > DAY_TYPE_NAME_MAX:
        raise ValueError(f"a day type name is 1 to {DAY_TYPE_NAME_MAX} characters")
    clash = conn.execute("SELECT id FROM day_types WHERE lower(name) = lower(?)", (name.strip(),)).fetchone()
    if clash and clash["id"] != day_type_id:
        raise ValueError(f"you already have a day type called {name.strip()}")
    return name.strip()


def _claim_weekdays(conn: sqlite3.Connection, day_type_id: int, weekdays: list[int]) -> None:
    """A weekday belongs to one day type: giving it to this one takes it from the others."""
    for other in list_day_types(conn):
        if other["id"] != day_type_id and set(other["weekdays"]) & set(weekdays):
            rest = [d for d in other["weekdays"] if d not in weekdays]
            conn.execute("UPDATE day_types SET weekdays = ? WHERE id = ?", (json.dumps(rest), other["id"]))


def add_day_type(conn: sqlite3.Connection, name: str, weekdays: list[int] | None = None) -> int:
    name = _day_type_name(conn, name)
    days = _weekdays(weekdays or [])
    position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM day_types").fetchone()[0]
    with conn:
        cur = conn.execute("INSERT INTO day_types (name, weekdays, position) VALUES (?, ?, ?)", (name, json.dumps(days), position))
        _claim_weekdays(conn, cur.lastrowid, days)
    return cur.lastrowid


def update_day_type(conn: sqlite3.Connection, day_type_id: int, changes: dict) -> None:
    if not _exists_in(conn, "day_types", "id", day_type_id):
        raise KeyError(day_type_id)
    with conn:
        if "name" in changes:
            conn.execute("UPDATE day_types SET name = ? WHERE id = ?", (_day_type_name(conn, changes["name"], day_type_id), day_type_id))
        if "weekdays" in changes:
            days = _weekdays(changes["weekdays"])
            conn.execute("UPDATE day_types SET weekdays = ? WHERE id = ?", (json.dumps(days), day_type_id))
            _claim_weekdays(conn, day_type_id, days)


def delete_day_type(conn: sqlite3.Connection, day_type_id: int) -> None:
    """Its blocks keep running on their own weekdays."""
    if not _exists_in(conn, "day_types", "id", day_type_id):
        raise KeyError(day_type_id)
    with conn:
        conn.execute("DELETE FROM day_types WHERE id = ?", (day_type_id,))


def day_type_id_by_name(conn: sqlite3.Connection, name: str) -> int | None:
    row = conn.execute("SELECT id FROM day_types WHERE lower(name) = lower(?)", (name.strip(),)).fetchone()
    return row["id"] if row else None


def day_type_on(conn: sqlite3.Connection, day: str, types: list[dict] | None = None) -> dict | None:
    """The day type of a date: a one-day override, else the type that owns the weekday."""
    types = list_day_types(conn) if types is None else types
    override = conn.execute("SELECT day_type_id FROM day_overrides WHERE date = ?", (day,)).fetchone()
    if override:
        found = next((t for t in types if t["id"] == override["day_type_id"]), None)
        if found:
            return {"id": found["id"], "name": found["name"], "overridden": True}
    weekday = date.fromisoformat(day).weekday()
    found = next((t for t in types if weekday in t["weekdays"]), None)
    return {"id": found["id"], "name": found["name"], "overridden": False} if found else None


def set_day_override(conn: sqlite3.Connection, day: str, day_type_id: int | None) -> None:
    """Switch one date to another day type, or back to its usual one with None."""
    date.fromisoformat(day)
    with conn:
        if day_type_id is None:
            conn.execute("DELETE FROM day_overrides WHERE date = ?", (day,))
            return
        if not _exists_in(conn, "day_types", "id", day_type_id):
            raise ValueError("no such day type")
        conn.execute("INSERT OR REPLACE INTO day_overrides (date, day_type_id) VALUES (?, ?)", (day, day_type_id))


def _applies(block: dict, day_type: dict | None, weekday: int) -> bool:
    if block["day_type_id"] is not None:
        return day_type is not None and day_type["id"] == block["day_type_id"]
    return weekday in block["weekdays"]


def blocks_on(conn: sqlite3.Connection, day: str, routines: list[dict] | None = None, types: list[dict] | None = None) -> list[dict]:
    routines = list_routines(conn) if routines is None else routines
    day_type = day_type_on(conn, day, types)
    weekday = date.fromisoformat(day).weekday()
    return [r for r in routines if _applies(r, day_type, weekday)]


# Suggested starting routine

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
        {"name": "Morning routine", "start": _at(wake), "end": _at(wake + 45), "weekdays": every_day, "note": "Water, light, plan the day", "kind": "habit"},
        {"name": "Deep work 1", "start": "09:00", "end": _at(9 * 60 + first), "weekdays": weekdays, "note": "Phone in another room"},
        {"name": "Recovery: lunch away from screens", "start": "12:30", "end": "13:15", "weekdays": every_day, "note": None, "kind": "recovery"},
        {"name": "Workout", "start": "18:00", "end": "19:00", "weekdays": [0, 2, 4, 5], "note": None, "kind": "habit"},
        {"name": "Wind down", "start": _at(wake - round(t["sleep_target_hours"] * 60) - 30),
         "end": _at(wake - round(t["sleep_target_hours"] * 60)), "weekdays": every_day, "note": "Screens off, read", "kind": "habit"},
    ]
    if second:
        blocks.insert(3, {"name": "Deep work 2", "start": "14:00", "end": _at(14 * 60 + second), "weekdays": weekdays, "note": None})
    return blocks


def add_suggested(conn: sqlite3.Connection, today: str) -> None:
    if list_routines(conn):
        raise ValueError("you already have a routine")
    for block in suggested(conn, today):
        add(conn, block)


# Logs: done, skipped, snoozed, and which reminders were shown

def _log(conn: sqlite3.Connection, day: str) -> dict[int, dict]:
    return {r["routine_id"]: dict(r) for r in conn.execute("SELECT * FROM routine_logs WHERE date = ?", (day,))}


def _upsert_log(conn: sqlite3.Connection, routine_id: int, day: str, **values) -> None:
    cols = ", ".join(values)
    updates = ", ".join(f"{k} = excluded.{k}" for k in values)
    conn.execute(
        f"INSERT INTO routine_logs (routine_id, date, {cols}) VALUES (?, ?, {', '.join('?' * len(values))}) "
        f"ON CONFLICT (routine_id, date) DO UPDATE SET {updates}",
        (routine_id, day, *values.values()),
    )


def log_block(conn: sqlite3.Connection, routine_id: int, day: str, status: str | None, reason: str | None = None) -> None:
    """Mark a block done or skipped (with what got in the way), or clear it. Done ticks its habit."""
    block = _exists(conn, routine_id)
    date.fromisoformat(day)
    if status not in ("done", "skipped", None):
        raise ValueError("status must be done or skipped")
    if reason is not None and (not isinstance(reason, str) or len(reason) > 200):
        raise ValueError("reason must be at most 200 characters")
    with conn:
        _upsert_log(conn, routine_id, day, status=status, reason=(reason or "").strip() or None if status == "skipped" else None)
    if status == "done" and block["habit_key"]:
        from .checkins import log_habit

        log_habit(conn, day, block["habit_key"], "done")


def snooze(conn: sqlite3.Connection, routine_id: int, day: str, until: str) -> None:
    _exists(conn, routine_id)
    if not HHMM.fullmatch(until or ""):
        raise ValueError("until must be HH:MM")
    with conn:
        _upsert_log(conn, routine_id, day, snoozed_until=until)


def mark_shown(conn: sqlite3.Connection, routine_id: int, day: str, which: str, at: str) -> None:
    _exists(conn, routine_id)
    if which == "heads_up":
        values = {"heads_up_at": at}
    elif which == "start":
        values = {"started_at": at, "snoozed_until": None}
    else:
        raise ValueError("which must be heads_up or start")
    with conn:
        _upsert_log(conn, routine_id, day, **values)


# Tasks queued for blocks

def _rolled(conn: sqlite3.Connection, block: dict, since: str, day: str, types: list[dict]) -> int:
    """How many of this block's runs a task has waited through, from its due date up to (not including) today."""
    start = max(date.fromisoformat(since), date.fromisoformat(day) - timedelta(days=ROLL_LOOKBACK_DAYS))
    count, d = 0, start
    while d < date.fromisoformat(day):
        if _applies(block, day_type_on(conn, d.isoformat(), types), d.weekday()):
            count += 1
        d += timedelta(days=1)
    return count


def _block_tasks(conn: sqlite3.Connection, day: str, blocks: list[dict], types: list[dict]) -> dict[int, list[dict]]:
    """Open tasks queued for each block, oldest first. A missed one shows at the block's next run."""
    out: dict[int, list[dict]] = {}
    by_id = {b["id"]: b for b in blocks}
    rows = conn.execute(
        """SELECT id, title, due_date, notes, routine_id FROM tasks
           WHERE routine_id IS NOT NULL AND done_at IS NULL AND (due_date IS NULL OR due_date <= ?)
           ORDER BY due_date IS NULL, due_date, id""",
        (day,),
    )
    for t in rows:
        block = by_id.get(t["routine_id"])
        if block is None:
            continue
        rolled = _rolled(conn, block, t["due_date"], day, types) if t["due_date"] and t["due_date"] < day else 0
        out.setdefault(block["id"], []).append({**dict(t), "rolled": rolled})
    return out


def plan(conn: sqlite3.Connection, day: str) -> dict:
    """Today's blocks in time order with their log and queued tasks, and the milestones due today."""
    routines = list_routines(conn)
    types = list_day_types(conn)
    blocks = blocks_on(conn, day, routines, types)
    logs = _log(conn, day)
    queued = _block_tasks(conn, day, blocks, types)
    due = [m for m in goals.this_week(goals.list_goals(conn), day) if m["due_date"] == day]
    return {
        "date": day,
        "day_type": day_type_on(conn, day, types),
        "day_types": [{"id": t["id"], "name": t["name"]} for t in types],
        "blocks": [
            {**b, "status": logs.get(b["id"], {}).get("status"), "reason": logs.get(b["id"], {}).get("reason"),
             "tasks": queued.get(b["id"], [])}
            for b in blocks
        ],
        "due_today": [{"id": m["id"], "title": m["title"], "goal_title": m["goal_title"]} for m in due],
        "has_routine": bool(routines),
    }


# Reminders: 5 minutes before a block, and when it starts

def _minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def due_reminders(conn: sqlite3.Connection, now: str) -> list[dict]:
    """Block reminders due at `now` (local YYYY-MM-DDTHH:MM). Each shows once; a snooze shows the start again."""
    day, at = now[:10], _minutes(now[11:16])
    p = plan(conn, day)
    logs = _log(conn, day)
    out = []
    for b in p["blocks"]:
        log = logs.get(b["id"], {})
        if log.get("status"):
            continue
        start = _minutes(b["start"])
        which = None
        if b["remind_before"] and not log.get("heads_up_at") and start - HEADS_UP_MINUTES <= at < start:
            which = "heads_up"
        elif b["remind_start"] and not log.get("started_at") and start <= at < start + START_WINDOW_MINUTES:
            which = "start"
        elif log.get("snoozed_until") and _minutes(log["snoozed_until"]) <= at < _minutes(log["snoozed_until"]) + START_WINDOW_MINUTES:
            which = "start"
        if which:
            task = b["tasks"][0] if b["tasks"] else None
            out.append({
                "routine_id": b["id"], "date": day, "which": which, "name": b["name"], "start": b["start"], "end": b["end"],
                "kind": b["kind"], "goal_title": b["goal_title"], "steps": b["steps"], "note": b["note"],
                "task": task["title"] if task else None,
            })
    return out


def for_coach(conn: sqlite3.Connection, today: str | None = None) -> dict:
    """The weekly routine, day types, and the last 14 days of done and skipped blocks."""
    days = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    types = list_day_types(conn)
    routines = list_routines(conn)
    blocks = [
        {k: v for k, v in {
            "name": r["name"], "time": f"{r['start']}–{r['end']}", "kind": r["kind"],
            "days": r["day_type"] or [days[d] for d in r["weekdays"]], "goal": r["goal_title"], "habit": r["habit_name"],
            "steps": r["steps"] or None, "note": r["note"],
        }.items() if v is not None}
        for r in routines
    ]
    out = {"blocks": blocks, "day_types": [{"name": t["name"], "days": [days[d] for d in t["weekdays"]]} for t in types]}
    if today:
        since = (date.fromisoformat(today) - timedelta(days=14)).isoformat()
        rows = conn.execute(
            """SELECT r.name, l.status, l.reason FROM routine_logs l JOIN routines r ON r.id = l.routine_id
               WHERE l.date >= ? AND l.date <= ? AND l.status IS NOT NULL ORDER BY l.date""",
            (since, today),
        )
        log: dict[str, dict] = {}
        for r in rows:
            entry = log.setdefault(r["name"], {"done": 0, "skipped": 0, "reasons": []})
            entry[r["status"]] += 1
            if r["reason"]:
                entry["reasons"] = (entry["reasons"] + [r["reason"]])[-5:]
        out["last_14_days"] = log
    return out
