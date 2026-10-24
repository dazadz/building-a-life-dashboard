"""Chat with Samuel: the prompt's coach mode as a conversation with follow-ups.

The user's messages are stored here; each one starts a coach run (the `ask` skill) that reads the
conversation through `samuel export --chat` and saves its reply with `samuel report add --kind ask
--chat`. Nothing leaves the computer except what Claude Code sends to Anthropic for that run.
"""

import sqlite3

MESSAGE_MAX = 2000
TITLE_MAX = 80
HISTORY = 20  # the most recent messages the coach sees


class Busy(Exception):
    pass


def _clean(text: str) -> str:
    if not isinstance(text, str) or not text.strip():
        raise ValueError("message is empty")
    text = text.strip()
    if len(text) > MESSAGE_MAX:
        raise ValueError(f"message must be at most {MESSAGE_MAX} characters")
    return text


def _title(text: str) -> str:
    line = " ".join(text.split())
    return line if len(line) <= TITLE_MAX else line[: TITLE_MAX - 1].rstrip() + "…"


def _exists(conn: sqlite3.Connection, chat_id: int) -> None:
    if conn.execute("SELECT 1 FROM chats WHERE id = ?", (chat_id,)).fetchone() is None:
        raise LookupError("no such chat")


def pending(conn: sqlite3.Connection, chat_id: int) -> bool:
    return conn.execute(
        "SELECT 1 FROM coach_jobs WHERE chat_id = ? AND status = 'running'", (chat_id,)
    ).fetchone() is not None


def create(conn: sqlite3.Connection, text: str, report_id: int | None = None) -> int:
    text = _clean(text)
    if report_id is not None and conn.execute("SELECT 1 FROM reports WHERE id = ?", (report_id,)).fetchone() is None:
        raise LookupError("no such report")
    with conn:
        chat_id = conn.execute(
            "INSERT INTO chats (title, report_id) VALUES (?, ?)", (_title(text), report_id)
        ).lastrowid
        conn.execute("INSERT INTO chat_messages (chat_id, role, text) VALUES (?, 'user', ?)", (chat_id, text))
    return chat_id


def ask(conn: sqlite3.Connection, chat_id: int, text: str) -> None:
    """Add a follow-up from the user. Refused while Samuel is still answering."""
    _exists(conn, chat_id)
    text = _clean(text)
    if pending(conn, chat_id):
        raise Busy("Samuel is still answering. Wait for the reply, then ask your follow-up.")
    with conn:
        conn.execute("INSERT INTO chat_messages (chat_id, role, text) VALUES (?, 'user', ?)", (chat_id, text))


def awaiting_reply(conn: sqlite3.Connection, chat_id: int) -> bool:
    last = conn.execute(
        "SELECT role FROM chat_messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1", (chat_id,)
    ).fetchone()
    return last is not None and last["role"] == "user"


def add_reply(conn: sqlite3.Connection, chat_id: int, text: str) -> int:
    """Samuel's answer to the latest message. One reply per question."""
    _exists(conn, chat_id)
    if not text.strip():
        raise ValueError("reply is empty")
    if not awaiting_reply(conn, chat_id):
        raise ValueError("this chat has no question waiting for a reply")
    with conn:
        return conn.execute(
            "INSERT INTO chat_messages (chat_id, role, text) VALUES (?, 'samuel', ?)", (chat_id, text.strip())
        ).lastrowid


def get(conn: sqlite3.Connection, chat_id: int) -> dict:
    _exists(conn, chat_id)
    row = conn.execute("SELECT id, title, report_id, created_at FROM chats WHERE id = ?", (chat_id,)).fetchone()
    messages = [dict(m) for m in conn.execute(
        "SELECT id, role, text, created_at FROM chat_messages WHERE chat_id = ? ORDER BY id", (chat_id,)
    )]
    last_job = conn.execute(
        "SELECT status, error FROM coach_jobs WHERE chat_id = ? ORDER BY id DESC LIMIT 1", (chat_id,)
    ).fetchone()
    waiting = awaiting_reply(conn, chat_id)
    return {
        **dict(row),
        "messages": messages,
        "pending": bool(last_job and last_job["status"] == "running"),
        # The last run failed and the question is still unanswered: the app offers "Try again".
        "error": last_job["error"] if last_job and last_job["status"] == "failed" and waiting else None,
        "awaiting_reply": waiting,
    }


def list_chats(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        """SELECT c.id, c.title, c.report_id, c.created_at,
                  MAX(m.created_at) AS updated_at, COUNT(m.id) AS messages
           FROM chats c LEFT JOIN chat_messages m ON m.chat_id = c.id
           GROUP BY c.id ORDER BY updated_at DESC, c.id DESC LIMIT ?""",
        (limit,),
    )
    return [{**dict(r), "pending": pending(conn, r["id"])} for r in rows]


def delete(conn: sqlite3.Connection, chat_id: int) -> None:
    _exists(conn, chat_id)
    with conn:
        conn.execute("DELETE FROM coach_jobs WHERE chat_id = ?", (chat_id,))
        conn.execute("DELETE FROM chats WHERE id = ?", (chat_id,))


def for_coach(conn: sqlite3.Connection, chat_id: int) -> dict:
    """The conversation so far, for the `ask` skill."""
    _exists(conn, chat_id)
    report_id = conn.execute("SELECT report_id FROM chats WHERE id = ?", (chat_id,)).fetchone()["report_id"]
    about = None
    if report_id is not None:
        r = conn.execute("SELECT kind, date, markdown FROM reports WHERE id = ?", (report_id,)).fetchone()
        about = dict(r) if r else None
    messages = [dict(m) for m in conn.execute(
        """SELECT role, text, created_at FROM chat_messages WHERE chat_id = ?
           ORDER BY id DESC LIMIT ?""", (chat_id, HISTORY),
    )][::-1]
    return {"id": chat_id, "about_report": about, "messages": messages}
