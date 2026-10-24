"""SQLite storage: where the database lives, connections, migrations and backups."""

import json
import os
import sqlite3
from datetime import datetime
from importlib import resources
from pathlib import Path


def data_dir() -> Path:
    """The folder holding the database. It lives outside the repo so personal data can't be committed."""
    override = os.environ.get("SAMUEL_DATA_DIR")
    path = Path(override).expanduser() if override else Path.home() / ".samuel"
    path.mkdir(parents=True, exist_ok=True)
    return path


def db_path() -> Path:
    return data_dir() / "samuel.db"


def connect(path: Path | None = None) -> sqlite3.Connection:
    """Open the database and bring it up to the latest schema."""
    path = path or db_path()
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    migrate(conn, path)
    return conn


FK_OFF = "-- needs: foreign_keys off"


def _migrations() -> list[tuple[int, str]]:
    files = resources.files("samuel") / "migrations"
    found = []
    for f in files.iterdir():
        if f.name.endswith(".sql"):
            found.append((int(f.name.split("_", 1)[0]), f.read_text(encoding="utf-8")))
    return sorted(found)


def migrate(conn: sqlite3.Connection, path: Path) -> int:
    """Apply pending migrations in order. An existing database is backed up first."""
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    pending = [(v, sql) for v, sql in _migrations() if v > current]
    if pending and current > 0:
        backup(conn, path.parent / "backups", reason=f"before-v{pending[-1][0]}")
    for version, sql in pending:
        # Rebuilding a table that others reference needs foreign keys off (SQLite's own recipe),
        # then a check that every link still holds before the change is kept.
        fk_off = FK_OFF in sql
        if fk_off:
            conn.execute("PRAGMA foreign_keys = OFF")
        try:
            conn.executescript(f"BEGIN;\n{sql}\nPRAGMA user_version = {version};")
            if fk_off and conn.execute("PRAGMA foreign_key_check").fetchone():
                raise sqlite3.IntegrityError(f"migration {version} would break links between tables")
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
        finally:
            if fk_off:
                conn.execute("PRAGMA foreign_keys = ON")
    return len(pending)


def backup(conn: sqlite3.Connection, folder: Path | None = None, reason: str = "manual",
           when: datetime | None = None) -> Path:
    """Write a dated copy of the database and return its path."""
    folder = folder or data_dir() / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"samuel-{when or datetime.now():%Y%m%d-%H%M%S}-{reason}.db"
    with sqlite3.connect(target) as dest:
        conn.backup(dest)
    dest.close()
    return target


def get_setting(conn: sqlite3.Connection, key: str, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def settings(conn: sqlite3.Connection) -> dict:
    return {r["key"]: json.loads(r["value"]) for r in conn.execute("SELECT key, value FROM settings")}
