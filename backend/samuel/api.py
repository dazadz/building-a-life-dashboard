"""HTTP API for the web app. Binds to localhost only (see cli.serve)."""

import re
import time
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import backups, coach, db, goals, habits, profile, reports, routines, scores, security, settings, weekly
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


class SettingsIn(BaseModel):
    name: str | None = Field(None, max_length=40)
    wake_target: str | None = None
    sleep_target_hours: float | None = None
    deep_work_target_hours: float | None = None
    onboarded: bool | None = None
    text_size: str | None = None


class HabitActiveIn(BaseModel):
    active: bool


class HabitIn(BaseModel):
    status: Literal["done", "missed", "skipped"] | None


class GoalIn(BaseModel):
    title: str = Field(max_length=120)
    area: str
    impact: int = Field(3, ge=1, le=5)
    effort: int = Field(3, ge=1, le=5)
    target_date: str | None = None


class GoalChange(BaseModel):
    title: str | None = Field(None, max_length=120)
    area: str | None = None
    impact: int | None = Field(None, ge=1, le=5)
    effort: int | None = Field(None, ge=1, le=5)
    target_date: str | None = None
    done: bool | None = None


class MilestoneIn(BaseModel):
    title: str = Field(max_length=120)
    due_date: str | None = None


class MilestoneChange(BaseModel):
    title: str | None = Field(None, max_length=120)
    due_date: str | None = None
    done: bool | None = None


class VisionIn(BaseModel):
    vision: str | None = Field(None, max_length=goals.VISION_MAX)


class ProfileIn(BaseModel):
    answers: dict = {}
    done: bool | None = None


class WeeklyIn(BaseModel):
    answers: dict[str, str] = {}
    priorities: list[str] = []
    carry: list[int] = []
    status: Literal["draft", "done"] = "draft"


class RoutineIn(BaseModel):
    name: str = Field(max_length=80)
    start: str
    end: str
    weekdays: list[int] = [0, 1, 2, 3, 4, 5, 6]
    note: str | None = Field(None, max_length=200)


class RoutineChange(BaseModel):
    name: str | None = Field(None, max_length=80)
    start: str | None = None
    end: str | None = None
    weekdays: list[int] | None = None
    note: str | None = Field(None, max_length=200)


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
    app.state.last_request = time.monotonic()

    @app.middleware("http")
    async def note_activity(request, call_next):
        app.state.last_request = time.monotonic()
        return await call_next(request)

    @app.get("/api/status")
    def status(conn=Depends(get_conn)):
        return {
            "coach": {**coach.status(), "has_recent_checkin": coach.has_recent_checkin(conn)},
            "today": date.today().isoformat(),
            "name": db.get_setting(conn, "name"),
            "onboarded": bool(db.get_setting(conn, "onboarded", False)),
            "text_size": db.get_setting(conn, "text_size", settings.DEFAULT_TEXT_SIZE),
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

    @app.get("/api/settings")
    def get_settings(today: str | None = None, conn=Depends(get_conn)):
        return settings.public(conn, _day(today) if today else date.today().isoformat())

    @app.put("/api/settings")
    def put_settings(body: SettingsIn, today: str | None = None, conn=Depends(get_conn)):
        day = _day(today) if today else date.today().isoformat()
        try:
            settings.update(conn, body.model_dump(exclude_none=True), day)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return settings.public(conn, day)

    @app.put("/api/habit-settings/{key}")
    def put_habit_setting(key: str, body: HabitActiveIn, conn=Depends(get_conn)):
        try:
            settings.set_habit_active(conn, key, body.active)
        except KeyError:
            raise HTTPException(404, "unknown habit")
        return settings.habit_list(conn)

    def goals_today(today: str | None) -> str:
        return _day(today) if today else date.today().isoformat()

    def goal_write(work):
        try:
            work()
        except KeyError:
            raise HTTPException(404, "no such goal or milestone")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    # Every goals write returns the whole Goals screen, like the check-in routes return the day.
    @app.get("/api/goals")
    def get_goals(today: str | None = None, conn=Depends(get_conn)):
        return goals.summary(conn, goals_today(today))

    @app.post("/api/goals")
    def post_goal(body: GoalIn, today: str | None = None, conn=Depends(get_conn)):
        day = goals_today(today)
        goal_write(lambda: goals.add_goal(conn, body.model_dump(), day))
        return goals.summary(conn, day)

    @app.put("/api/goals/{goal_id}")
    def put_goal(goal_id: int, body: GoalChange, today: str | None = None, conn=Depends(get_conn)):
        # Only the fields sent change, so sending "target_date": null clears it.
        day = goals_today(today)
        goal_write(lambda: goals.update_goal(conn, goal_id, body.model_dump(exclude_unset=True), day))
        return goals.summary(conn, day)

    @app.delete("/api/goals/{goal_id}")
    def delete_goal(goal_id: int, today: str | None = None, conn=Depends(get_conn)):
        goal_write(lambda: goals.delete_goal(conn, goal_id))
        return goals.summary(conn, goals_today(today))

    @app.post("/api/goals/{goal_id}/milestones")
    def post_milestone(goal_id: int, body: MilestoneIn, today: str | None = None, conn=Depends(get_conn)):
        goal_write(lambda: goals.add_milestone(conn, goal_id, body.model_dump()))
        return goals.summary(conn, goals_today(today))

    @app.put("/api/milestones/{milestone_id}")
    def put_milestone(milestone_id: int, body: MilestoneChange, today: str | None = None, conn=Depends(get_conn)):
        day = goals_today(today)
        goal_write(lambda: goals.update_milestone(conn, milestone_id, body.model_dump(exclude_unset=True), day))
        return goals.summary(conn, day)

    @app.delete("/api/milestones/{milestone_id}")
    def delete_milestone(milestone_id: int, today: str | None = None, conn=Depends(get_conn)):
        goal_write(lambda: goals.delete_milestone(conn, milestone_id))
        return goals.summary(conn, goals_today(today))

    @app.put("/api/vision")
    def put_vision(body: VisionIn, today: str | None = None, conn=Depends(get_conn)):
        goal_write(lambda: goals.set_vision(conn, body.vision))
        return goals.summary(conn, goals_today(today))

    @app.get("/api/profile")
    def get_profile(conn=Depends(get_conn)):
        return profile.summary(conn)

    @app.put("/api/profile/{section}")
    def put_profile(section: str, body: ProfileIn, conn=Depends(get_conn)):
        try:
            profile.save(conn, section, body.answers, body.done)
        except KeyError:
            raise HTTPException(404, "no such section")
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return profile.summary(conn)

    @app.get("/api/weekly")
    def get_weekly(week: str | None = None, today: str | None = None, conn=Depends(get_conn)):
        day = _day(today) if today else date.today().isoformat()
        return weekly.review(conn, _day(week) if week else weekly.default_week(day), day)

    @app.put("/api/weekly/{week_start}")
    def put_weekly(week_start: str, body: WeeklyIn, today: str | None = None, conn=Depends(get_conn)):
        day = _day(today) if today else date.today().isoformat()
        try:
            weekly.save(conn, _day(week_start), body.answers, body.priorities, body.carry, body.status, day)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return weekly.review(conn, week_start, day)

    def routine_write(work):
        try:
            work()
        except KeyError:
            raise HTTPException(404, "no such block")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @app.get("/api/routines")
    def get_routines(conn=Depends(get_conn)):
        return routines.list_routines(conn)

    @app.post("/api/routines")
    def post_routine(body: RoutineIn, conn=Depends(get_conn)):
        routine_write(lambda: routines.add(conn, body.model_dump()))
        return routines.list_routines(conn)

    @app.post("/api/routines/suggested")
    def post_suggested(today: str | None = None, conn=Depends(get_conn)):
        routine_write(lambda: routines.add_suggested(conn, _day(today) if today else date.today().isoformat()))
        return routines.list_routines(conn)

    @app.put("/api/routines/{routine_id}")
    def put_routine(routine_id: int, body: RoutineChange, conn=Depends(get_conn)):
        # Only the fields sent change, so sending "note": null clears the note.
        routine_write(lambda: routines.update(conn, routine_id, body.model_dump(exclude_unset=True)))
        return routines.list_routines(conn)

    @app.delete("/api/routines/{routine_id}")
    def delete_routine(routine_id: int, conn=Depends(get_conn)):
        routine_write(lambda: routines.delete(conn, routine_id))
        return routines.list_routines(conn)

    @app.get("/api/plan/{day}")
    def get_plan(day: str, conn=Depends(get_conn)):
        return routines.plan(conn, _day(day))

    @app.get("/api/data")
    def get_data(conn=Depends(get_conn)):
        return {
            "data_dir": str(db.data_dir()),
            "last_backup": backups.last_backup(),
            "backups": len(backups.list_backups()),
            "keep_daily": backups.KEEP_DAILY,
        }

    @app.post("/api/backup")
    def post_backup(conn=Depends(get_conn)):
        db.backup(conn, backups.folder(), reason="manual")
        return get_data(conn)

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
