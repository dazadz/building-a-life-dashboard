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
