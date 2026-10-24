"""Daily backups, and full export and import as JSON.

Exports hold every piece of personal data, so they are never written inside a git repository.
"""

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

from . import db

KEEP_DAILY = 14
FORMAT = "samuel-export"
# In foreign-key order: a table comes after the tables it points to.
TABLES = ("settings", "target_history", "habits", "checkins", "habit_logs", "reports", "chats", "chat_messages", "goals", "milestones",
          "profile_answers", "weekly_reviews", "day_types", "day_overrides", "routines", "routine_logs", "tasks", "subtasks",
          "health_logs", "energy_taps", "pains_goals", "suggestions")
# Not moved: coach job history and the 30-day undo bin.
NOT_EXPORTED = ("coach_jobs", "trash")


def folder() -> Path:
    return db.data_dir() / "backups"


def list_backups() -> list[Path]:
    return sorted(folder().glob("samuel-*.db")) if folder().exists() else []


def daily_backup(conn: sqlite3.Connection, today: date | None = None) -> Path | None:
    """Take today's backup if there isn't one yet, and keep only the last 14 daily ones."""
    day = today or date.today()
    stamp = day.strftime("%Y%m%d")
    daily = sorted(folder().glob("samuel-*-daily.db")) if folder().exists() else []
    if any(p.name.startswith(f"samuel-{stamp}-") for p in daily):
        return None
    now = datetime.now()
    path = db.backup(conn, folder(), reason="daily", when=now.replace(year=day.year, month=day.month, day=day.day))
    daily = sorted(folder().glob("samuel-*-daily.db"))
    for old in daily[:-KEEP_DAILY]:
        old.unlink()
    return path


def last_backup() -> dict | None:
    found = list_backups()
    if not found:
        return None
    newest = max(found, key=lambda p: p.stat().st_mtime)
    return {"file": newest.name, "at": datetime.fromtimestamp(newest.stat().st_mtime).isoformat(timespec="seconds")}


def inside_git_repo(path: Path) -> bool:
    for parent in [path.resolve(), *path.resolve().parents]:
        if (parent / ".git").exists():
            return True
    return False


def export_all(conn: sqlite3.Connection) -> dict:
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    return {
        "format": FORMAT,
        "schema_version": version,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "tables": {t: [dict(r) for r in conn.execute(f"SELECT * FROM {t}")] for t in TABLES},
    }


def is_empty(conn: sqlite3.Connection) -> bool:
    return all(
        conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] == 0
        for t in ("checkins", "habit_logs", "reports", "chats", "chat_messages", "goals", "profile_answers", "weekly_reviews", "tasks")
    )


def import_all(conn: sqlite3.Connection, data: dict) -> dict:
    """Restore an export into an empty database. Returns the row count per table."""
    if data.get("format") != FORMAT:
        raise ValueError("this file isn't a Samuel export")
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if data.get("schema_version") != version:
        raise ValueError(
            f"this export is from database version {data.get('schema_version')}, "
            f"but this Samuel uses version {version}"
        )
    if not is_empty(conn):
        raise ValueError("this database already has data; import only into an empty one")

    counts = {}
    with conn:
        # The migrations seed default settings and habits; the export replaces them.
        for t in reversed(TABLES):
            conn.execute(f"DELETE FROM {t}")
        for t in TABLES:
            rows = data["tables"].get(t, [])
            columns = {r[1] for r in conn.execute(f"PRAGMA table_info({t})")}
            for row in rows:
                unknown = set(row) - columns
                if unknown:
                    raise ValueError(f"unexpected columns in {t}: {', '.join(sorted(unknown))}")
                cols = list(row)
                conn.execute(
                    f"INSERT INTO {t} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                    [row[c] for c in cols],
                )
            counts[t] = len(rows)
    return counts
