"""Saving check-ins and habit logs."""

import sqlite3

from .scores import inputs, targets

FIELDS = (
    "wake_time", "sleep_hours", "mood", "energy", "main_goal", "workout",
    "deep_work_hours", "productivity", "distraction", "wins", "failures", "improvement",
)


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def save_checkin(conn: sqlite3.Connection, day: str, answers: dict) -> dict:
    """Upsert a check-in. A blank answer never overwrites a saved one."""
    given = {k: answers[k] for k in FIELDS if k in answers and not _blank(answers[k])}
    cols = ["date", *given]
    updates = ", ".join(f"{k} = excluded.{k}" for k in given)
    sql = (
        f"INSERT INTO checkins ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))}) "
        "ON CONFLICT (date) DO UPDATE SET "
        + (updates + ", " if updates else "")
        + "updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')"
    )
    with conn:
        conn.execute(sql, (day, *given.values()))
        auto_tick(conn, day)
    return dict(conn.execute("SELECT * FROM checkins WHERE date = ?", (day,)).fetchone())


def auto_tick(conn: sqlite3.Connection, day: str) -> None:
    """Tick the four habits the check-in answers. Manual logs always win."""
    checkin = dict(conn.execute("SELECT * FROM checkins WHERE date = ?", (day,)).fetchone())
    t = targets(conn)
    v = inputs(checkin, {}, t)

    status = {
        "wake_on_time": None if v["wake"] is None else ("done" if v["wake"] == 1.0 else "missed"),
        "sleep_target": None if checkin["sleep_hours"] is None
        else ("done" if checkin["sleep_hours"] >= t["sleep_target_hours"] else "missed"),
        "deep_work": None if checkin["deep_work_hours"] is None
        else ("done" if checkin["deep_work_hours"] >= t["deep_work_target_hours"] else "missed"),
        "workout": {"yes": "done", "no": "missed", "rest": "skipped"}.get(checkin["workout"]),
    }
    for key, st in status.items():
        if st is None:
            continue
        conn.execute(
            """INSERT INTO habit_logs (habit_id, date, status, source)
               SELECT id, ?, ?, 'auto' FROM habits WHERE key = ?
               ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status
               WHERE habit_logs.source = 'auto'""",
            (day, st, key),
        )


def log_habit(conn: sqlite3.Connection, day: str, key: str, status: str | None) -> None:
    """Log a habit by hand. None clears the log."""
    habit = conn.execute("SELECT id FROM habits WHERE key = ?", (key,)).fetchone()
    if habit is None:
        raise KeyError(key)
    with conn:
        if status is None:
            conn.execute("DELETE FROM habit_logs WHERE habit_id = ? AND date = ?", (habit["id"], day))
        else:
            conn.execute(
                """INSERT INTO habit_logs (habit_id, date, status, source) VALUES (?, ?, ?, 'manual')
                   ON CONFLICT (habit_id, date) DO UPDATE SET status = excluded.status, source = 'manual'""",
                (habit["id"], day, status),
            )


def habits_for(conn: sqlite3.Connection, day: str) -> list[dict]:
    rows = conn.execute(
        """SELECT h.key, h.name, h.auto, l.status, l.source FROM habits h
           LEFT JOIN habit_logs l ON l.habit_id = h.id AND l.date = ?
           WHERE h.archived = 0 ORDER BY h.position""",
        (day,),
    )
    return [dict(r) for r in rows]
