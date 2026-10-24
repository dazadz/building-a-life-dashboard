"""Recently deleted: undo for deletes, kept 30 days on this computer.

Before a delete, the rows it removes are copied here. Restoring puts them back, with their original
ids when those are still free, and new ids (with child rows relinked) when they aren't.
"""

import json
import sqlite3
from datetime import datetime, timedelta, timezone

KEEP_DAYS = 30
# kind: (table, title column, child tables as (table, foreign key))
KINDS = {
    "goal": ("goals", "title", [("milestones", "goal_id")]),
    "milestone": ("milestones", "title", []),
    "task": ("tasks", "title", [("subtasks", "task_id")]),
    "routine": ("routines", "name", []),
    "chat": ("chats", "title", [("chat_messages", "chat_id")]),
}


def _rows(conn: sqlite3.Connection, table: str, column: str, value) -> list[dict]:
    return [dict(r) for r in conn.execute(f"SELECT * FROM {table} WHERE {column} = ?", (value,))]


def purge(conn: sqlite3.Connection, now: datetime | None = None) -> int:
    cutoff = ((now or datetime.now(timezone.utc)) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    with conn:
        return conn.execute("DELETE FROM trash WHERE deleted_at < ?", (cutoff,)).rowcount


def capture(conn: sqlite3.Connection, kind: str, row_id: int) -> int | None:
    """Copy what deleting this item will remove. Returns the trash id, or None if it doesn't exist."""
    table, title_col, children = KINDS[kind]
    parent = _rows(conn, table, "id", row_id)
    if not parent:
        return None
    data = {table: parent}
    for child, fk in children:
        data[child] = _rows(conn, child, fk, row_id)
    if kind == "goal":
        # Deleting a goal unlinks its tasks (goal_id becomes null); remember them to link back.
        data["linked_tasks"] = [r["id"] for r in conn.execute("SELECT id FROM tasks WHERE goal_id = ?", (row_id,))]
    purge(conn)
    with conn:
        return conn.execute(
            "INSERT INTO trash (kind, title, data) VALUES (?, ?, ?)",
            (kind, parent[0][title_col], json.dumps(data, ensure_ascii=False)),
        ).lastrowid


def _insert(conn: sqlite3.Connection, table: str, row: dict) -> int:
    """Insert a row, keeping its id if it's free."""
    taken = conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row["id"],)).fetchone()
    values = {k: v for k, v in row.items() if not (k == "id" and taken)}
    cols = ", ".join(values)
    marks = ", ".join("?" for _ in values)
    return conn.execute(f"INSERT INTO {table} ({cols}) VALUES ({marks})", list(values.values())).lastrowid


def restore(conn: sqlite3.Connection, trash_id: int) -> dict:
    row = conn.execute("SELECT * FROM trash WHERE id = ?", (trash_id,)).fetchone()
    if row is None:
        raise LookupError("nothing to restore: it may have been restored already or removed after 30 days")
    kind = row["kind"]
    table, _, children = KINDS[kind]
    data = json.loads(row["data"])
    parent = data[table][0]
    with conn:
        if kind == "milestone" and conn.execute("SELECT 1 FROM goals WHERE id = ?", (parent["goal_id"],)).fetchone() is None:
            raise ValueError("its goal was deleted too: restore the goal first")
        if kind == "task" and parent.get("goal_id") is not None and \
                conn.execute("SELECT 1 FROM goals WHERE id = ?", (parent["goal_id"],)).fetchone() is None:
            parent = {**parent, "goal_id": None}
        new_id = _insert(conn, table, parent)
        for child, fk in children:
            for r in data.get(child, []):
                _insert(conn, child, {**r, fk: new_id})
        for task_id in data.get("linked_tasks", []):
            conn.execute("UPDATE tasks SET goal_id = ? WHERE id = ? AND goal_id IS NULL", (new_id, task_id))
        conn.execute("DELETE FROM trash WHERE id = ?", (trash_id,))
    return {"kind": kind, "id": new_id, "title": row["title"]}


def list_trash(conn: sqlite3.Connection) -> list[dict]:
    purge(conn)
    return [dict(r) for r in conn.execute("SELECT id, kind, title, deleted_at FROM trash ORDER BY id DESC")]


def empty(conn: sqlite3.Connection) -> None:
    with conn:
        conn.execute("DELETE FROM trash")
