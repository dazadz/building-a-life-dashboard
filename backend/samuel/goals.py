"""Goals by life area, their milestones, and the long-term vision."""

import json
import sqlite3
from datetime import date, timedelta

AREAS = ("fitness", "financial", "career", "learning", "business", "social", "relationships", "health", "other")
GOAL_FIELDS = ("title", "area", "impact", "effort", "target_date")
MILESTONE_FIELDS = ("title", "due_date")
VISION_MAX = 1000


def validate_goal(changes: dict) -> dict:
    clean = {}
    for key, value in changes.items():
        if key == "title":
            if not isinstance(value, str) or not value.strip() or len(value) > 120:
                raise ValueError("title must be 1 to 120 characters")
            value = value.strip()
        elif key == "area":
            if value not in AREAS:
                raise ValueError(f"area must be one of {', '.join(AREAS)}")
        elif key in ("impact", "effort"):
            if not isinstance(value, int) or not 1 <= value <= 5:
                raise ValueError(f"{key} must be 1 to 5")
        elif key in ("target_date", "due_date"):
            if value is not None:
                try:
                    date.fromisoformat(value)
                except (TypeError, ValueError):
                    raise ValueError(f"{key} must be YYYY-MM-DD")
        else:
            raise ValueError(f"unknown field {key}")
        clean[key] = value
    return clean


def progress(milestones: list[dict]) -> int | None:
    """Share of milestones done, as a %. None when a goal has no milestones yet."""
    if not milestones:
        return None
    return round(100 * sum(1 for m in milestones if m["done_date"]) / len(milestones))


def _next_milestone(milestones: list[dict]) -> dict | None:
    open_ = [m for m in milestones if not m["done_date"]]
    # Dated milestones first, soonest first; undated ones in the order they were added.
    open_.sort(key=lambda m: (m["due_date"] is None, m["due_date"] or "", m["id"]))
    return open_[0] if open_ else None


def list_goals(conn: sqlite3.Connection) -> list[dict]:
    milestones: dict[int, list[dict]] = {}
    for r in conn.execute("SELECT * FROM milestones ORDER BY due_date IS NULL, due_date, id"):
        milestones.setdefault(r["goal_id"], []).append(dict(r))
    out = []
    for r in conn.execute("SELECT * FROM goals ORDER BY done_date IS NOT NULL, target_date IS NULL, target_date, id"):
        ms = milestones.get(r["id"], [])
        out.append({**dict(r), "milestones": ms, "progress": progress(ms), "next_milestone": _next_milestone(ms)})
    return out


def this_week(goals: list[dict], today: str) -> list[dict]:
    """Open milestones of active goals due in the next 7 days, plus any overdue ones."""
    end = (date.fromisoformat(today) + timedelta(days=6)).isoformat()
    due = [
        {**m, "goal_title": g["title"], "overdue": m["due_date"] < today}
        for g in goals if not g["done_date"]
        for m in g["milestones"]
        if not m["done_date"] and m["due_date"] and m["due_date"] <= end
    ]
    return sorted(due, key=lambda m: (m["due_date"], m["id"]))


def summary(conn: sqlite3.Connection, today: str) -> dict:
    goals = list_goals(conn)
    return {
        "goals": goals,
        "week": this_week(goals, today),
        "vision": get_vision(conn),
        "completed_this_year": sum(1 for g in goals if g["done_date"] and g["done_date"][:4] == today[:4]),
    }


def _exists(conn: sqlite3.Connection, table: str, row_id: int) -> None:
    if conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row_id,)).fetchone() is None:
        raise KeyError(row_id)


def add_goal(conn: sqlite3.Connection, fields: dict, today: str) -> int:
    clean = validate_goal({k: v for k, v in fields.items() if k in GOAL_FIELDS})
    if "title" not in clean or "area" not in clean:
        raise ValueError("a goal needs a title and an area")
    cols = [*clean, "created_at"]
    with conn:
        cur = conn.execute(
            f"INSERT INTO goals ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            [*clean.values(), today],
        )
    return cur.lastrowid


def update_goal(conn: sqlite3.Connection, goal_id: int, changes: dict, today: str) -> None:
    _exists(conn, "goals", goal_id)
    done = changes.pop("done", None)
    clean = validate_goal(changes)
    if done is not None:
        clean["done_date"] = today if done else None
    if clean:
        with conn:
            conn.execute(
                f"UPDATE goals SET {', '.join(f'{k} = ?' for k in clean)} WHERE id = ?", [*clean.values(), goal_id]
            )


def delete_goal(conn: sqlite3.Connection, goal_id: int) -> None:
    _exists(conn, "goals", goal_id)
    with conn:
        conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))


def add_milestone(conn: sqlite3.Connection, goal_id: int, fields: dict) -> int:
    _exists(conn, "goals", goal_id)
    clean = validate_goal({k: v for k, v in fields.items() if k in MILESTONE_FIELDS})
    if "title" not in clean:
        raise ValueError("a milestone needs a title")
    with conn:
        cur = conn.execute(
            "INSERT INTO milestones (goal_id, title, due_date) VALUES (?, ?, ?)",
            (goal_id, clean["title"], clean.get("due_date")),
        )
    return cur.lastrowid


def update_milestone(conn: sqlite3.Connection, milestone_id: int, changes: dict, today: str) -> None:
    _exists(conn, "milestones", milestone_id)
    done = changes.pop("done", None)
    clean = validate_goal(changes)
    if done is not None:
        clean["done_date"] = today if done else None
    if clean:
        with conn:
            conn.execute(
                f"UPDATE milestones SET {', '.join(f'{k} = ?' for k in clean)} WHERE id = ?",
                [*clean.values(), milestone_id],
            )


def delete_milestone(conn: sqlite3.Connection, milestone_id: int) -> None:
    _exists(conn, "milestones", milestone_id)
    with conn:
        conn.execute("DELETE FROM milestones WHERE id = ?", (milestone_id,))


def get_vision(conn: sqlite3.Connection) -> str | None:
    row = conn.execute("SELECT value FROM settings WHERE key = 'vision'").fetchone()
    return json.loads(row["value"]) if row else None


def set_vision(conn: sqlite3.Connection, text: str | None) -> None:
    text = (text or "").strip()
    if len(text) > VISION_MAX:
        raise ValueError(f"the vision must be at most {VISION_MAX} characters")
    with conn:
        if text:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('vision', ?)", (json.dumps(text),))
        else:
            conn.execute("DELETE FROM settings WHERE key = 'vision'")


def for_coach(conn: sqlite3.Connection, today: str) -> dict:
    """What the coach sees: the vision, active goals and their open milestones."""
    active = [g for g in list_goals(conn) if not g["done_date"]]
    return {
        "vision": get_vision(conn),
        "active": [
            {
                "title": g["title"], "area": g["area"], "impact": g["impact"], "effort": g["effort"],
                "target_date": g["target_date"], "progress": g["progress"],
                "open_milestones": [
                    {"title": m["title"], "due_date": m["due_date"]} for m in g["milestones"] if not m["done_date"]
                ],
            }
            for g in active
        ],
        "due_this_week": [
            {"goal": m["goal_title"], "title": m["title"], "due_date": m["due_date"], "overdue": m["overdue"]}
            for m in this_week(active, today)
        ],
    }
