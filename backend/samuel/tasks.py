"""Tasks, subtasks and reminders. All times are the user's local time, sent by the app."""

import re
import sqlite3
from datetime import date, datetime, timedelta

PRIORITIES = ("high", "normal", "low")
FIELDS = ("title", "notes", "list", "priority", "due_date", "due_time", "remind_at", "goal_id", "routine_id", "type")
# Same types as routine blocks (routines.KINDS); kept here so tasks doesn't import routines.
TYPES = ("focus", "fixed", "work", "spiritual", "habit", "recovery", "leisure")
HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
VIEWS = ("today", "upcoming", "overdue", "all", "done")


def validate(conn: sqlite3.Connection, changes: dict) -> dict:
    clean = {}
    for key, value in changes.items():
        if key == "title":
            if not isinstance(value, str) or not value.strip() or len(value) > 200:
                raise ValueError("title must be 1 to 200 characters")
            value = value.strip()
        elif key == "notes":
            if value is not None and (not isinstance(value, str) or len(value) > 4000):
                raise ValueError("notes must be at most 4000 characters")
            value = (value or "").strip() or None
        elif key == "list":
            if not isinstance(value, str) or not value.strip() or len(value) > 40:
                raise ValueError("list must be 1 to 40 characters")
            value = value.strip()
        elif key == "priority":
            if value not in PRIORITIES:
                raise ValueError("priority must be high, normal or low")
        elif key == "due_date":
            if value is not None:
                try:
                    date.fromisoformat(value)
                except (TypeError, ValueError):
                    raise ValueError("due_date must be YYYY-MM-DD")
        elif key == "due_time":
            if value is not None and (not isinstance(value, str) or not HHMM.fullmatch(value)):
                raise ValueError("due_time must be HH:MM")
        elif key == "remind_at":
            if value is not None:
                try:
                    datetime.strptime(value, "%Y-%m-%dT%H:%M")
                except (TypeError, ValueError):
                    raise ValueError("remind_at must be YYYY-MM-DDTHH:MM")
        elif key == "goal_id":
            if value is not None and conn.execute("SELECT 1 FROM goals WHERE id = ?", (value,)).fetchone() is None:
                raise ValueError("no such goal")
        elif key == "type":
            if value is not None and value not in TYPES:
                raise ValueError(f"type must be one of {', '.join(TYPES)}")
        elif key == "routine_id":
            if value is not None and conn.execute("SELECT 1 FROM routines WHERE id = ?", (value,)).fetchone() is None:
                raise ValueError("no such routine block")
        else:
            raise ValueError(f"unknown field {key}")
        clean[key] = value
    return clean


def _exists(conn: sqlite3.Connection, table: str, row_id: int) -> None:
    if conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row_id,)).fetchone() is None:
        raise KeyError(row_id)


def _subtask(item) -> tuple[str, str | None]:
    """A subtask's title and due date, from a title or {"title", "due_date"}."""
    title, due = (item, None) if isinstance(item, str) else (item.get("title"), item.get("due_date")) if isinstance(item, dict) else (None, None)
    if not isinstance(title, str) or not title.strip() or len(title) > 200:
        raise ValueError("subtasks are titles of 1 to 200 characters")
    validate(None, {"due_date": due})
    return title.strip(), due


def add(conn: sqlite3.Connection, fields: dict) -> int:
    subtasks = fields.get("subtasks") or []
    clean = validate(conn, {k: v for k, v in fields.items() if k in FIELDS})
    if "title" not in clean:
        raise ValueError("a task needs a title")
    if not isinstance(subtasks, list):
        raise ValueError("subtasks are a list")
    subtasks = [_subtask(s) for s in subtasks]
    with conn:
        cur = conn.execute(
            f"INSERT INTO tasks ({', '.join(clean)}) VALUES ({', '.join('?' * len(clean))})", list(clean.values()),
        )
        for title, due in subtasks:
            conn.execute("INSERT INTO subtasks (task_id, title, due_date) VALUES (?, ?, ?)", (cur.lastrowid, title, due))
    return cur.lastrowid


def update(conn: sqlite3.Connection, task_id: int, changes: dict, now: str) -> None:
    _exists(conn, "tasks", task_id)
    done = changes.pop("done", None)
    clean = validate(conn, changes)
    if "remind_at" in clean:
        clean["notified_at"] = None  # a new reminder time should notify again
    if done is not None:
        clean["done_at"] = now if done else None
    if clean:
        with conn:
            conn.execute(f"UPDATE tasks SET {', '.join(f'{k} = ?' for k in clean)} WHERE id = ?", [*clean.values(), task_id])


def delete(conn: sqlite3.Connection, task_id: int) -> None:
    _exists(conn, "tasks", task_id)
    with conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))


def snooze(conn: sqlite3.Connection, task_id: int, how: str, now: str) -> None:
    """+1 hour moves the reminder an hour from now; Tomorrow moves the due date and reminder a day on."""
    _exists(conn, "tasks", task_id)
    t = dict(conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone())
    now_dt = datetime.strptime(now, "%Y-%m-%dT%H:%M")
    if how == "hour":
        changes = {"remind_at": (now_dt + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M")}
    elif how == "tomorrow":
        tomorrow = (now_dt.date() + timedelta(days=1)).isoformat()
        remind_time = t["remind_at"][11:] if t["remind_at"] else None
        changes = {"due_date": tomorrow, "remind_at": f"{tomorrow}T{remind_time}" if remind_time else None}
    else:
        raise ValueError("snooze is hour or tomorrow")
    update(conn, task_id, changes, now)


def add_subtask(conn: sqlite3.Connection, task_id: int, title: str, due_date: str | None = None) -> None:
    _exists(conn, "tasks", task_id)
    title, due = _subtask({"title": title, "due_date": due_date})
    with conn:
        conn.execute("INSERT INTO subtasks (task_id, title, due_date) VALUES (?, ?, ?)", (task_id, title, due))


_UNSET = object()


def set_subtask(conn: sqlite3.Connection, subtask_id: int, done: bool | None, delete_it: bool = False, due_date=_UNSET) -> None:
    """Tick or untick a subtask, change its due date (None clears it), or delete it."""
    _exists(conn, "subtasks", subtask_id)
    if due_date is not _UNSET:
        validate(None, {"due_date": due_date})
    with conn:
        if delete_it:
            conn.execute("DELETE FROM subtasks WHERE id = ?", (subtask_id,))
            return
        if done is not None:
            conn.execute("UPDATE subtasks SET done = ? WHERE id = ?", (1 if done else 0, subtask_id))
        if due_date is not _UNSET:
            conn.execute("UPDATE subtasks SET due_date = ? WHERE id = ?", (due_date, subtask_id))


def _all(conn: sqlite3.Connection) -> list[dict]:
    subs: dict[int, list[dict]] = {}
    for s in conn.execute("SELECT * FROM subtasks ORDER BY id"):
        subs.setdefault(s["task_id"], []).append({**dict(s), "done": bool(s["done"])})
    goal_titles = {r["id"]: r["title"] for r in conn.execute("SELECT id, title FROM goals")}
    return [
        {**dict(r), "subtasks": subs.get(r["id"], []), "goal_title": goal_titles.get(r["goal_id"])}
        for r in conn.execute("SELECT * FROM tasks")
    ]


def view_of(t: dict, today: str) -> str:
    if t["done_at"]:
        return "done"
    if t["due_date"] and t["due_date"] < today:
        return "overdue"
    if t["due_date"] == today:
        return "today"
    return "upcoming" if t["due_date"] else "someday"


def summary(conn: sqlite3.Connection, now: str) -> dict:
    """Every task with its view, the counts per view, the lists in use, and today's reminders."""
    today = now[:10]
    tasks = _all(conn)
    for t in tasks:
        t["view"] = view_of(t, today)
    open_ = [t for t in tasks if not t["done_at"]]
    counts = {
        "today": sum(1 for t in open_ if t["view"] == "today"),
        "upcoming": sum(1 for t in open_ if t["view"] in ("upcoming", "someday")),
        "overdue": sum(1 for t in open_ if t["view"] == "overdue"),
        "all": len(open_),
        "done": len(tasks) - len(open_),
    }
    week_end = (date.fromisoformat(today) + timedelta(days=6)).isoformat()
    reminders = sorted(
        ({"id": t["id"], "title": t["title"], "remind_at": t["remind_at"]} for t in open_
         if t["remind_at"] and t["remind_at"][:10] <= week_end),
        key=lambda r: r["remind_at"],
    )
    return {
        "tasks": tasks,
        "counts": counts,
        "this_week": sum(1 for t in open_ if t["due_date"] and today < t["due_date"] <= week_end),
        "lists": sorted({t["list"] for t in tasks} | {"Personal", "Work"}),
        "reminders": reminders,
    }


def due_reminders(conn: sqlite3.Connection, now: str) -> list[dict]:
    """Reminders that are due and haven't been shown yet."""
    rows = conn.execute(
        "SELECT id, title, list, remind_at FROM tasks WHERE done_at IS NULL AND remind_at IS NOT NULL "
        "AND remind_at <= ? AND notified_at IS NULL ORDER BY remind_at", (now,),
    )
    return [dict(r) for r in rows]


def mark_notified(conn: sqlite3.Connection, task_id: int, now: str) -> None:
    _exists(conn, "tasks", task_id)
    with conn:
        conn.execute("UPDATE tasks SET notified_at = ? WHERE id = ?", (now, task_id))


def for_coach(conn: sqlite3.Connection, today: str) -> dict:
    """Open tasks that are overdue or due in the next 7 days."""
    week_end = (date.fromisoformat(today) + timedelta(days=6)).isoformat()
    open_ = [t for t in _all(conn) if not t["done_at"] and t["due_date"] and t["due_date"] <= week_end]
    open_.sort(key=lambda t: (t["due_date"], t["due_time"] or ""))
    return {
        "open_due_soon": [
            {"title": t["title"], "type": t["type"], "priority": t["priority"], "due": t["due_date"],
             "time": t["due_time"], "overdue": t["due_date"] < today, "goal": t["goal_title"]}
            for t in open_
        ],
    }
