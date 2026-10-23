"""HTTP API for the web app. Binds to localhost only (see cli.serve)."""

import re
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import coach, db, habits, reports, scores, security
from .checkins import habits_for, log_habit, save_checkin

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class CheckinIn(BaseModel):
    wake_time: str | None = None
    sleep_hours: float | None = Field(None, ge=0, le=24)
    mood: Literal["low", "flat", "okay", "good", "great"] | None = None
    energy: int | None = Field(None, ge=1, le=10)
    main_goal: str | None = Field(None, max_length=500)
    workout: Literal["yes", "no", "rest"] | None = None
    deep_work_hours: float | None = Field(None, ge=0, le=24)
    productivity: int | None = Field(None, ge=1, le=10)
    distraction: str | None = Field(None, max_length=100)
    wins: str | None = Field(None, max_length=2000)
    failures: str | None = Field(None, max_length=2000)
    improvement: str | None = Field(None, max_length=2000)

    @field_validator("wake_time")
    @classmethod
    def _hhmm(cls, v: str | None) -> str | None:
        if v and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
            raise ValueError("use HH:MM")
        return v


class HabitIn(BaseModel):
    status: Literal["done", "missed", "skipped"] | None


class CoachRunIn(BaseModel):
    skill: str = "daily-report"


def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


def _day(day: str) -> str:
    try:
        return date.fromisoformat(day).isoformat()
    except ValueError:
        raise HTTPException(422, "date must be YYYY-MM-DD")


def create_app(allowed_hosts: set[str] = security.LOCAL_HOSTS) -> FastAPI:
    # No interactive API docs: they load scripts from a CDN.
    app = FastAPI(title="Samuel", docs_url=None, redoc_url=None, openapi_url=None)
    security.protect(app, allowed_hosts)

    @app.get("/api/status")
    def status(conn=Depends(get_conn)):
        return {
            "coach": {**coach.status(), "has_recent_checkin": coach.has_recent_checkin(conn)},
            "today": date.today().isoformat(),
            "name": db.get_setting(conn, "name"),
        }

    @app.get("/api/days/{day}")
    def get_day(day: str, conn=Depends(get_conn)):
        day = _day(day)
        return {
            "date": day,
            "checkin": scores.checkin_row(conn, day),
            "habits": habits_for(conn, day),
            "summary": scores.summary(conn, day),
        }

    @app.put("/api/checkins/{day}")
    def put_checkin(day: str, body: CheckinIn, conn=Depends(get_conn)):
        day = _day(day)
        save_checkin(conn, day, body.model_dump())
        return get_day(day, conn)

    @app.get("/api/habits")
    def get_habits(end: str | None = None, days: int = 14, conn=Depends(get_conn)):
        if days not in (7, 14, 30, 90):
            raise HTTPException(422, "days must be 7, 14, 30 or 90")
        return habits.history(conn, _day(end) if end else date.today().isoformat(), days)

    @app.put("/api/habits/{day}/{key}")
    def put_habit(day: str, key: str, body: HabitIn, conn=Depends(get_conn)):
        day = _day(day)
        try:
            log_habit(conn, day, key, body.status)
        except KeyError:
            raise HTTPException(404, "unknown habit")
        return get_day(day, conn)

    @app.get("/api/reports")
    def get_reports(kind: str | None = None, limit: int = 20, conn=Depends(get_conn)):
        return reports.list_reports(conn, kind, min(limit, 100))

    @app.post("/api/coach/run", status_code=202)
    def run_coach(body: CoachRunIn, conn=Depends(get_conn)):
        try:
            return {"job_id": coach.start(conn, body.skill)}
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        except coach.NothingToReport as exc:
            raise HTTPException(409, str(exc))
        except RuntimeError as exc:
            raise HTTPException(503, str(exc))

    @app.get("/api/coach/jobs/{job_id}")
    def get_job(job_id: int, conn=Depends(get_conn)):
        found = coach.job(conn, job_id)
        if found is None:
            raise HTTPException(404, "no such job")
        return found

    if FRONTEND_DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404)
            file = (FRONTEND_DIST / path).resolve()
            if path and file.is_file() and FRONTEND_DIST in file.parents:
                return FileResponse(file)
            return FileResponse(FRONTEND_DIST / "index.html")

    return app
