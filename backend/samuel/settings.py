"""User settings: name, daily targets and which habits are tracked."""

import json
import re
import sqlite3

TARGETS = ("wake_target", "sleep_target_hours", "deep_work_target_hours")
EARLIEST = "0001-01-01"
TEXT_SIZES = ("small", "medium", "large", "xlarge")
DEFAULT_TEXT_SIZE = "medium"


def validate(key: str, value):
    if key == "name":
        if not isinstance(value, str) or not value.strip() or len(value) > 40:
            raise ValueError("name must be 1 to 40 characters")
        return value.strip()
    if key == "wake_target":
        if not isinstance(value, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError("wake_target must be HH:MM")
        return value
    if key == "sleep_target_hours":
        if not isinstance(value, (int, float)) or not 4 <= value <= 12:
            raise ValueError("sleep target must be between 4 and 12 hours")
        return float(value)
    if key == "deep_work_target_hours":
        if not isinstance(value, (int, float)) or not 0.5 <= value <= 12:
            raise ValueError("deep work target must be between 0.5 and 12 hours")
        return float(value)
    if key == "theme":
        # {"accent": "#rrggbb", "darkness": "dim" | "dark" | "midnight", "tint": 0..1}, or {} for the default look
        if value == {}:
            return {}
        if (not isinstance(value, dict) or set(value) != {"accent", "darkness", "tint"}
                or not isinstance(value["accent"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value["accent"])
                or value["darkness"] not in ("dim", "dark", "midnight")
                or isinstance(value["tint"], bool) or not isinstance(value["tint"], (int, float)) or not 0 <= value["tint"] <= 1):
            raise ValueError("theme needs a #rrggbb accent, a darkness of dim, dark or midnight, and a tint from 0 to 1")
        return {"accent": value["accent"].lower(), "darkness": value["darkness"], "tint": float(value["tint"])}
    if key == "text_size":
        if value not in TEXT_SIZES:
            raise ValueError(f"text_size must be one of {', '.join(TEXT_SIZES)}")
        return value
    if key == "onboarded":
        if not isinstance(value, bool):
            raise ValueError("onboarded must be true or false")
        return value
    raise ValueError(f"unknown setting {key}")


def update(conn: sqlite3.Connection, changes: dict, today: str) -> None:
    """Save settings. A changed target applies from `today`; earlier days keep the old one."""
    clean = {k: validate(k, v) for k, v in changes.items() if v is not None}
    with conn:
        for key, value in clean.items():
            old = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
            if key in TARGETS and old is not None and json.loads(old["value"]) != value:
                # Record the value that applied before today the first time a target changes.
                conn.execute(
                    "INSERT OR IGNORE INTO target_history (key, value, from_date) VALUES (?, ?, ?)",
                    (key, old["value"], EARLIEST),
                )
                conn.execute(
                    "INSERT OR REPLACE INTO target_history (key, value, from_date) VALUES (?, ?, ?)",
                    (key, json.dumps(value), today),
                )
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, json.dumps(value))
            )


def targets_on(conn: sqlite3.Connection, day: str) -> dict:
    """The targets that applied on `day`."""
    out = {}
    for key in TARGETS:
        row = conn.execute(
            "SELECT value FROM target_history WHERE key = ? AND from_date <= ? ORDER BY from_date DESC LIMIT 1",
            (key, day),
        ).fetchone()
        if row is None:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        out[key] = json.loads(row["value"])
    return out


def habit_list(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT key, name, auto, archived FROM habits ORDER BY position")
    return [{"key": r["key"], "name": r["name"], "auto": r["auto"], "active": not r["archived"]} for r in rows]


def set_habit_active(conn: sqlite3.Connection, key: str, active: bool) -> None:
    with conn:
        cur = conn.execute("UPDATE habits SET archived = ? WHERE key = ?", (0 if active else 1, key))
    if cur.rowcount == 0:
        raise KeyError(key)


HABIT_NAME_MAX = 60
CUSTOM_HABITS_MAX = 20


def _habit_name(conn: sqlite3.Connection, name, key: str | None = None) -> str:
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > HABIT_NAME_MAX:
        raise ValueError(f"a habit name is 1 to {HABIT_NAME_MAX} characters")
    name = name.strip()
    clash = conn.execute("SELECT key FROM habits WHERE lower(name) = lower(?)", (name,)).fetchone()
    if clash and clash["key"] != key:
        raise ValueError(f"you already have a habit called {name}")
    return name


def habit_key_by_name(conn: sqlite3.Connection, name: str) -> str | None:
    row = conn.execute("SELECT key FROM habits WHERE lower(name) = lower(?)", (name.strip(),)).fetchone()
    return row["key"] if row else None


def add_habit(conn: sqlite3.Connection, name: str) -> str:
    """A habit of the user's own, ticked by hand. Its key comes from the name."""
    name = _habit_name(conn, name)
    if conn.execute("SELECT COUNT(*) FROM habits WHERE key LIKE 'c\\_%' ESCAPE '\\'").fetchone()[0] >= CUSTOM_HABITS_MAX:
        raise ValueError(f"you can have up to {CUSTOM_HABITS_MAX} habits of your own")
    base = "c_" + (re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40] or "habit")
    key, n = base, 2
    while conn.execute("SELECT 1 FROM habits WHERE key = ?", (key,)).fetchone():
        key, n = f"{base}_{n}", n + 1
    position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM habits").fetchone()[0]
    with conn:
        conn.execute("INSERT INTO habits (key, name, auto, position) VALUES (?, ?, 0, ?)", (key, name, position))
    return key


def rename_habit(conn: sqlite3.Connection, key: str, name: str) -> None:
    if conn.execute("SELECT 1 FROM habits WHERE key = ?", (key,)).fetchone() is None:
        raise KeyError(key)
    name = _habit_name(conn, name, key)
    with conn:
        conn.execute("UPDATE habits SET name = ? WHERE key = ?", (name, key))


def public(conn: sqlite3.Connection, today: str) -> dict:
    stored = {r["key"]: json.loads(r["value"]) for r in conn.execute("SELECT key, value FROM settings")}
    return {
        "name": stored.get("name"),
        "onboarded": bool(stored.get("onboarded", False)),
        "text_size": stored.get("text_size", DEFAULT_TEXT_SIZE),
        "theme": stored.get("theme") or None,
        **targets_on(conn, today),
        "habits": habit_list(conn),
    }


def delete_habit(conn: sqlite3.Connection, key: str) -> None:
    """Delete a habit and its history. Blocks and pains that pointed at it stop pointing at anything."""
    row = conn.execute("SELECT id FROM habits WHERE key = ?", (key,)).fetchone()
    if row is None:
        raise KeyError(key)
    with conn:
        conn.execute("DELETE FROM habit_logs WHERE habit_id = ?", (row["id"],))
        conn.execute("UPDATE routines SET habit_key = NULL WHERE habit_key = ?", (key,))
        conn.execute("UPDATE pains_goals SET habit_key = NULL WHERE habit_key = ?", (key,))
        conn.execute("DELETE FROM habits WHERE id = ?", (row["id"],))
