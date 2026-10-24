"""What Samuel knows about the user beyond the onboarding answers: their pains and goals, and notes
in their own words. The coach reads both through `samuel export` and plans around them."""

import json
import sqlite3

from . import db

KINDS = ("pain", "goal")
STATUSES = ("active", "resolved")
FIELDS = ("kind", "text", "area", "evidence", "goal_id", "habit_key", "status")
NOTES_MAX = 4000
TEXT_MAX = {"text": 160, "area": 40, "evidence": 300}


def validate(conn: sqlite3.Connection, changes: dict) -> dict:
    clean = {}
    for key, value in changes.items():
        if key == "kind":
            if value not in KINDS:
                raise ValueError("kind must be pain or goal")
        elif key == "status":
            if value not in STATUSES:
                raise ValueError("status must be active or resolved")
        elif key == "text":
            if not isinstance(value, str) or not value.strip() or len(value) > TEXT_MAX["text"]:
                raise ValueError(f"text must be 1 to {TEXT_MAX['text']} characters")
            value = value.strip()
        elif key in ("area", "evidence"):
            if value is not None and (not isinstance(value, str) or len(value) > TEXT_MAX[key]):
                raise ValueError(f"{key} must be at most {TEXT_MAX[key]} characters")
            value = (value or "").strip() or None
        elif key == "goal_id":
            if value is not None and conn.execute("SELECT 1 FROM goals WHERE id = ?", (value,)).fetchone() is None:
                raise ValueError("no such goal")
        elif key == "habit_key":
            if value is not None and conn.execute("SELECT 1 FROM habits WHERE key = ?", (value,)).fetchone() is None:
                raise ValueError("no such habit")
        else:
            raise ValueError(f"unknown field {key}")
        clean[key] = value
    return clean


def list_items(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT p.*, g.title AS goal_title, g.done_date AS goal_done, h.name AS habit_name
           FROM pains_goals p
           LEFT JOIN goals g ON g.id = p.goal_id
           LEFT JOIN habits h ON h.key = p.habit_key
           ORDER BY p.status = 'resolved', p.position, p.id"""
    )
    return [dict(r) for r in rows]


def _exists(conn: sqlite3.Connection, item_id: int) -> None:
    if conn.execute("SELECT 1 FROM pains_goals WHERE id = ?", (item_id,)).fetchone() is None:
        raise KeyError(item_id)


def add(conn: sqlite3.Connection, fields: dict) -> int:
    clean = validate(conn, {k: v for k, v in fields.items() if k in FIELDS})
    if not {"kind", "text"} <= set(clean):
        raise ValueError("a pain or goal needs a kind and a text")
    position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM pains_goals").fetchone()[0]
    clean["position"] = position
    with conn:
        cur = conn.execute(
            f"INSERT INTO pains_goals ({', '.join(clean)}) VALUES ({', '.join('?' * len(clean))})", list(clean.values()),
        )
    return cur.lastrowid


def update(conn: sqlite3.Connection, item_id: int, changes: dict) -> None:
    _exists(conn, item_id)
    clean = validate(conn, changes)
    if clean:
        with conn:
            conn.execute(f"UPDATE pains_goals SET {', '.join(f'{k} = ?' for k in clean)} WHERE id = ?", [*clean.values(), item_id])


def delete(conn: sqlite3.Connection, item_id: int) -> None:
    _exists(conn, item_id)
    with conn:
        conn.execute("DELETE FROM pains_goals WHERE id = ?", (item_id,))


def get_notes(conn: sqlite3.Connection) -> str | None:
    return db.get_setting(conn, "about_me")


def set_notes(conn: sqlite3.Connection, text: str | None) -> None:
    if text is not None and (not isinstance(text, str) or len(text) > NOTES_MAX):
        raise ValueError(f"notes must be at most {NOTES_MAX} characters")
    text = (text or "").strip()
    with conn:
        if text:
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('about_me', ?)", (json.dumps(text, ensure_ascii=False),))
        else:
            conn.execute("DELETE FROM settings WHERE key = 'about_me'")


def summary(conn: sqlite3.Connection) -> dict:
    items = list_items(conn)
    return {
        "notes": get_notes(conn),
        "notes_max": NOTES_MAX,
        "items": items,
        "counts": {k: sum(1 for i in items if i["kind"] == k and i["status"] == "active") for k in KINDS},
    }


def for_coach(conn: sqlite3.Connection) -> dict:
    """The user's notes and their active pains and goals. All of it is their own words: data, not instructions."""
    return {
        "notes": get_notes(conn),
        "pains_and_goals": [
            {k: i[k] for k in ("kind", "text", "area", "evidence", "goal_title", "habit_name") if i[k] is not None}
            for i in list_items(conn) if i["status"] == "active"
        ],
    }
