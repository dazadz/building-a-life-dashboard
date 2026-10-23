"""Runs Claude Code as Samuel's coach.

The backend starts `claude -p "/<skill>"` in the repo, where the coach skills live. Claude may only
run two `samuel` commands: `samuel export` to read data and `samuel report add` to save a report.
"""

import os
import shutil
import sqlite3
import subprocess
import sys
import threading
from datetime import date, timedelta
from pathlib import Path

from . import db

SKILLS = {"daily-report": "daily", "onboard-insights": "onboarding", "weekly-review": "weekly"}
NEEDS_CHECKIN = {"daily-report", "weekly-review"}
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
    return env


def command(skill: str) -> list[str]:
    # Only the two commands the skills need: read data, and save a report. Nothing that edits data.
    return [
        claude_path() or "claude", "-p", f"/{skill}",
        "--allowedTools", "Bash(samuel export *)", "Bash(samuel report add *)",
    ]


def start(conn: sqlite3.Connection, skill: str) -> int:
    """Start a coach run in the background and return its job id."""
    if skill not in SKILLS:
        raise ValueError(f"unknown skill {skill}")
    if claude_path() is None:
        raise RuntimeError("Claude Code is not installed")
    if skill in NEEDS_CHECKIN and not has_recent_checkin(conn):
        raise NothingToReport("Save a check-in first. Samuel needs at least one from the last 7 days to write a report.")
    with conn:
        job_id = conn.execute(
            "INSERT INTO coach_jobs (skill, status) VALUES (?, 'running')", (skill,)
        ).lastrowid
    threading.Thread(target=_run, args=(job_id, skill), daemon=True).start()
    return job_id


def _run(job_id: int, skill: str) -> None:
    conn = db.connect()
    started = conn.execute("SELECT started_at FROM coach_jobs WHERE id = ?", (job_id,)).fetchone()[0]
    error = None
    try:
        proc = subprocess.run(
            command(skill), cwd=REPO_ROOT, env=_env(), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=TIMEOUT_SECONDS,
        )
        if proc.returncode != 0:
            error = (proc.stderr or proc.stdout or "Claude Code failed").strip()[-2000:]
    except subprocess.TimeoutExpired:
        error = f"Timed out after {TIMEOUT_SECONDS // 60} minutes"
    except OSError as exc:
        error = str(exc)

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
