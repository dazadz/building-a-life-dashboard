"""Runs Claude Code as Samuel's coach.

The backend starts `claude -p "/<skill>"` in the repo, where the coach skills live. Claude may only
run three `samuel` commands: `samuel export` to read data, `samuel report add` to save a report, and
`samuel suggest add` to propose changes the user then accepts or dismisses in the app.
"""

import os
import shutil
import sqlite3
import subprocess
import sys
import threading
from datetime import date, timedelta
from pathlib import Path

from . import chats, db

SKILLS = {
    "daily-report": "daily", "onboard-insights": "onboarding", "weekly-review": "weekly",
    "monthly-evolution": "monthly", "ask": "ask", "plan-builder": "plan",
}
NEEDS_CHECKIN = {"daily-report", "weekly-review", "monthly-evolution"}
TIMEOUT_SECONDS = 600
REPO_ROOT = Path(os.environ.get("SAMUEL_REPO", Path(__file__).resolve().parents[2]))


class NothingToReport(Exception):
    pass


def has_recent_checkin(conn: sqlite3.Connection) -> bool:
    since = (date.today() - timedelta(days=7)).isoformat()
    return conn.execute("SELECT 1 FROM checkins WHERE date >= ? LIMIT 1", (since,)).fetchone() is not None


def claude_path() -> str | None:
    return shutil.which("claude")


def status() -> dict:
    path = claude_path()
    return {"installed": path is not None, "skills": list(SKILLS)}


def _env() -> dict:
    """Make sure `samuel` resolves to this install and writes to this data dir."""
    env = dict(os.environ)
    scripts = Path(sys.executable).parent
    env["PATH"] = os.pathsep.join([str(scripts), str(scripts / "Scripts"), env.get("PATH", "")])
    env["SAMUEL_DATA_DIR"] = str(db.data_dir())
    env["PYTHONIOENCODING"] = "utf-8"
    env["SAMUEL_COACH"] = "1"  # the CLI then refuses full exports and reading report files
    return env


def _prompt(skill: str, chat_id: int | None, goal_id: int | None) -> str:
    if chat_id is not None:
        return f"/{skill} {int(chat_id)}"
    if goal_id is not None:
        return f"/{skill} goal {int(goal_id)}"
    return f"/{skill}"


def command(skill: str, chat_id: int | None = None, goal_id: int | None = None) -> list[str]:
    # Only the commands the skills need: read data, save a report, and propose suggestions the user
    # must accept. Nothing that edits data.
    # Bash is the only tool, and the user's own settings and MCP servers aren't loaded, so a run
    # can't inherit wider permissions (or connected services) from the person's Claude Code setup.
    return [
        claude_path() or "claude", "-p", _prompt(skill, chat_id, goal_id),
        "--tools", "Bash", "--setting-sources", "project", "--strict-mcp-config",
        "--allowedTools", "Bash(samuel export *)", "Bash(samuel report add *)", "Bash(samuel suggest add *)",
    ]


def start(conn: sqlite3.Connection, skill: str, chat_id: int | None = None, goal_id: int | None = None) -> int:
    """Start a coach run in the background and return its job id. `ask` answers a chat; `plan-builder`
    with a goal breaks that goal down."""
    if skill not in SKILLS:
        raise ValueError(f"unknown skill {skill}")
    if goal_id is not None:
        if skill != "plan-builder":
            raise ValueError("only the plan builder breaks down a goal")
        if conn.execute("SELECT 1 FROM goals WHERE id = ? AND done_date IS NULL", (goal_id,)).fetchone() is None:
            raise ValueError("no such active goal")
    if (skill == "ask") != (chat_id is not None):
        raise ValueError("ask runs answer a chat: use the chat endpoints")
    if claude_path() is None:
        raise RuntimeError("Claude Code is not installed")
    if skill in NEEDS_CHECKIN and not has_recent_checkin(conn):
        raise NothingToReport("Save a check-in first. Samuel needs at least one from the last 7 days to write a report.")
    with conn:
        job_id = conn.execute(
            "INSERT INTO coach_jobs (skill, status, chat_id) VALUES (?, 'running', ?)", (skill, chat_id)
        ).lastrowid
    threading.Thread(target=_run, args=(job_id, skill, chat_id, goal_id), daemon=True).start()
    return job_id


def _run(job_id: int, skill: str, chat_id: int | None = None, goal_id: int | None = None) -> None:
    conn = db.connect()
    started = conn.execute("SELECT started_at FROM coach_jobs WHERE id = ?", (job_id,)).fetchone()[0]
    error = None
    cmd = (command(skill, chat_id) if chat_id is not None
           else command(skill, goal_id=goal_id) if goal_id is not None else command(skill))
    try:
        proc = subprocess.run(
            cmd, cwd=REPO_ROOT, env=_env(), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=TIMEOUT_SECONDS,
        )
        if proc.returncode != 0:
            error = (proc.stderr or proc.stdout or "Claude Code failed").strip()[-2000:]
    except subprocess.TimeoutExpired:
        error = f"Timed out after {TIMEOUT_SECONDS // 60} minutes"
    except OSError as exc:
        error = str(exc)

    if chat_id is not None:
        report = None
        if error is None and chats.awaiting_reply(conn, chat_id):
            error = "Claude Code finished without replying"
    else:
        report = conn.execute(
            "SELECT id FROM reports WHERE kind = ? AND created_at >= ? ORDER BY id DESC LIMIT 1",
            (SKILLS[skill], started),
        ).fetchone()
        if error is None and report is None:
            error = "Claude Code finished without saving a report"
    with conn:
        conn.execute(
            """UPDATE coach_jobs SET status = ?, error = ?, report_id = ?,
               finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?""",
            ("failed" if error else "done", error, report["id"] if report else None, job_id),
        )
    conn.close()


def job(conn: sqlite3.Connection, job_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM coach_jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None
