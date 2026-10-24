"""HTTP API for the web app. Binds to localhost only (see cli.serve)."""

import os
import re
import time
from urllib.parse import quote
from datetime import date, datetime
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import about, backups, build, chats, coach, db, digest, energy, goals, habits, health, leaks, links, monthly, profile, reports, routines, scores, search, security, settings, suggestions, tasks, trash, weekly
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
    theme: dict | None = None


class HabitSettingIn(BaseModel):
    active: bool | None = None
    name: str | None = Field(None, max_length=settings.HABIT_NAME_MAX)
    move: Literal["up", "down"] | None = None


class HabitNewIn(BaseModel):
    name: str = Field(max_length=settings.HABIT_NAME_MAX)


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
    kind: Literal["focus", "fixed", "work", "faith", "health", "habit", "recovery", "leisure"] = "focus"
    goal_id: int | None = None
    habit_key: str | None = None
    steps: list[str] = []
    remind_before: bool = True
    remind_start: bool = True
    day_type_id: int | None = None


class RoutineChange(BaseModel):
    name: str | None = Field(None, max_length=80)
    start: str | None = None
    end: str | None = None
    weekdays: list[int] | None = None
    note: str | None = Field(None, max_length=200)
    kind: Literal["focus", "fixed", "work", "faith", "health", "habit", "recovery", "leisure"] | None = None
    goal_id: int | None = None
    habit_key: str | None = None
    steps: list[str] | None = None
    remind_before: bool | None = None
    remind_start: bool | None = None
    day_type_id: int | None = None


class DayTypeIn(BaseModel):
    name: str = Field(max_length=routines.DAY_TYPE_NAME_MAX)
    weekdays: list[int] = []


class DayTypeChange(BaseModel):
    name: str | None = Field(None, max_length=routines.DAY_TYPE_NAME_MAX)
    weekdays: list[int] | None = None


class DayOverrideIn(BaseModel):
    day_type_id: int | None  # None goes back to the usual day type


class BlockLogIn(BaseModel):
    status: Literal["done", "skipped"] | None
    reason: str | None = Field(None, max_length=200)


class BlockSnoozeIn(BaseModel):
    until: str  # local HH:MM


class TaskIn(BaseModel):
    # `subtasks` comes before `list`: once a field is called `list`, list[...] means that field.
    title: str = Field(max_length=200)
    subtasks: list[str | dict] = []
    notes: str | None = Field(None, max_length=4000)
    list: str = Field("Personal", max_length=40)
    priority: Literal["high", "normal", "low"] = "normal"
    due_date: str | None = None
    due_time: str | None = None
    remind_at: str | None = None
    goal_id: int | None = None
    routine_id: int | None = None
    type: Literal["focus", "fixed", "work", "faith", "health", "habit", "recovery", "leisure"] | None = None


class TaskChange(BaseModel):
    title: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=4000)
    list: str | None = Field(None, max_length=40)
    priority: Literal["high", "normal", "low"] | None = None
    due_date: str | None = None
    due_time: str | None = None
    remind_at: str | None = None
    goal_id: int | None = None
    routine_id: int | None = None
    type: Literal["focus", "fixed", "work", "faith", "health", "habit", "recovery", "leisure"] | None = None
    done: bool | None = None


class SnoozeIn(BaseModel):
    how: Literal["hour", "tomorrow"]


class SubtaskIn(BaseModel):
    title: str = Field(max_length=200)
    due_date: str | None = None


class SubtaskChange(BaseModel):
    done: bool | None = None
    due_date: str | None = None


class HealthLogIn(BaseModel):
    water_l: float | None = None
    caffeine_cups: int | None = None
    caffeine_last: str | None = None
    screens_late: int | None = None


class EnergyTapIn(BaseModel):
    value: int | None = Field(None, ge=1, le=10)
    at: str  # local HH:MM


class ChatIn(BaseModel):
    text: str = Field(max_length=chats.MESSAGE_MAX)
    report_id: int | None = None


class ChatMessageIn(BaseModel):
    text: str = Field(max_length=chats.MESSAGE_MAX)


class CoachRunIn(BaseModel):
    skill: str = "daily-report"
    goal_id: int | None = None


class AboutIn(BaseModel):
    notes: str | None = Field(None, max_length=about.NOTES_MAX)


class PainGoalIn(BaseModel):
    kind: Literal["pain", "goal"]
    text: str = Field(max_length=about.TEXT_MAX["text"])
    area: str | None = Field(None, max_length=about.TEXT_MAX["area"])
    evidence: str | None = Field(None, max_length=about.TEXT_MAX["evidence"])
    goal_id: int | None = None
    habit_key: str | None = None


class PainGoalChange(BaseModel):
    kind: Literal["pain", "goal"] | None = None
    text: str | None = Field(None, max_length=about.TEXT_MAX["text"])
    area: str | None = Field(None, max_length=about.TEXT_MAX["area"])
    evidence: str | None = Field(None, max_length=about.TEXT_MAX["evidence"])
    goal_id: int | None = None
    habit_key: str | None = None
    status: Literal["active", "resolved"] | None = None


class SuggestionAcceptIn(BaseModel):
    payload: dict | None = None  # the user's edited version, if they changed it


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


def create_app(allowed_hosts: set[str] = security.LOCAL_HOSTS, started_by: str = "serve") -> FastAPI:
    # No interactive API docs: they load scripts from a CDN.
    app = FastAPI(title="Samuel", docs_url=None, redoc_url=None, openapi_url=None)
    security.protect(app, allowed_hosts)
    app.state.last_request = time.monotonic()

    def undoable(response: Response, conn, kind: str, row_id: int, delete) -> None:
        """Copy the item to Recently deleted, delete it, and tell the app it can be undone."""
        trash_id = trash.capture(conn, kind, row_id)
        delete()
        if trash_id is not None:
            title = conn.execute("SELECT title FROM trash WHERE id = ?", (trash_id,)).fetchone()["title"]
            response.headers["X-Samuel-Undo"] = str(trash_id)
            response.headers["X-Samuel-Undo-Title"] = quote(title)

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
            "theme": db.get_setting(conn, "theme") or None,
            "suggestions": conn.execute("SELECT COUNT(*) FROM suggestions WHERE status = 'pending'").fetchone()[0],
            # So `samuel app` can replace a server it started before an update (see appwindow.run).
            "server": {"build": build.build_id(), "pid": os.getpid(), "started_by": started_by},
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

    @app.post("/api/habit-settings")
    def post_habit_setting(body: HabitNewIn, conn=Depends(get_conn)):
        try:
            settings.add_habit(conn, body.name)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return settings.habit_list(conn)

    @app.delete("/api/habit-settings/{key}")
    def delete_habit_setting(key: str, conn=Depends(get_conn)):
        try:
            settings.delete_habit(conn, key)
        except KeyError:
            raise HTTPException(404, "unknown habit")
        return settings.habit_list(conn)

    @app.put("/api/habit-settings/{key}")
    def put_habit_setting(key: str, body: HabitSettingIn, conn=Depends(get_conn)):
        try:
            if body.name is not None:
                settings.rename_habit(conn, key, body.name)
            if body.active is not None:
                settings.set_habit_active(conn, key, body.active)
            if body.move is not None:
                settings.move_habit(conn, key, body.move)
        except KeyError:
            raise HTTPException(404, "unknown habit")
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return settings.habit_list(conn)

    def about_write(work):
        try:
            work()
        except KeyError:
            raise HTTPException(404, "no such pain or goal")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    # About me: every write returns the whole page.
    @app.get("/api/about")
    def get_about(conn=Depends(get_conn)):
        return about.summary(conn)

    @app.put("/api/about")
    def put_about(body: AboutIn, conn=Depends(get_conn)):
        about_write(lambda: about.set_notes(conn, body.notes))
        return about.summary(conn)

    @app.post("/api/pains-goals")
    def post_pain_goal(body: PainGoalIn, conn=Depends(get_conn)):
        about_write(lambda: about.add(conn, body.model_dump()))
        return about.summary(conn)

    @app.put("/api/pains-goals/{item_id}")
    def put_pain_goal(item_id: int, body: PainGoalChange, conn=Depends(get_conn)):
        about_write(lambda: about.update(conn, item_id, body.model_dump(exclude_unset=True)))
        return about.summary(conn)

    @app.delete("/api/pains-goals/{item_id}")
    def delete_pain_goal(item_id: int, response: Response, conn=Depends(get_conn)):
        undoable(response, conn, "pain_goal", item_id, lambda: about_write(lambda: about.delete(conn, item_id)))
        return about.summary(conn)

    def suggestion_write(work):
        try:
            return work()
        except KeyError:
            raise HTTPException(404, "no such suggestion")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @app.get("/api/suggestions")
    def get_suggestions(conn=Depends(get_conn)):
        return suggestions.summary(conn)

    @app.post("/api/suggestions/{suggestion_id}/accept")
    def accept_suggestion(suggestion_id: int, body: SuggestionAcceptIn, today: str | None = None, conn=Depends(get_conn)):
        day = _day(today) if today else date.today().isoformat()
        suggestion_write(lambda: suggestions.accept(conn, suggestion_id, day, body.payload))
        return suggestions.summary(conn)

    @app.post("/api/suggestions/{suggestion_id}/dismiss")
    def dismiss_suggestion(suggestion_id: int, conn=Depends(get_conn)):
        suggestion_write(lambda: suggestions.dismiss(conn, suggestion_id))
        return suggestions.summary(conn)

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
    def delete_goal(goal_id: int, response: Response, today: str | None = None, conn=Depends(get_conn)):
        undoable(response, conn, "goal", goal_id, lambda: goal_write(lambda: goals.delete_goal(conn, goal_id)))
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
    def delete_milestone(milestone_id: int, response: Response, today: str | None = None, conn=Depends(get_conn)):
        undoable(response, conn, "milestone", milestone_id,
                 lambda: goal_write(lambda: goals.delete_milestone(conn, milestone_id)))
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
    def delete_routine(routine_id: int, response: Response, conn=Depends(get_conn)):
        undoable(response, conn, "routine", routine_id, lambda: routine_write(lambda: routines.delete(conn, routine_id)))
        return routines.list_routines(conn)

    @app.get("/api/plan/{day}")
    def get_plan(day: str, conn=Depends(get_conn)):
        return routines.plan(conn, _day(day))

    # Day types: every write returns the list, with how many blocks each has.
    @app.get("/api/day-types")
    def get_day_types(conn=Depends(get_conn)):
        return routines.list_day_types(conn)

    @app.post("/api/day-types")
    def post_day_type(body: DayTypeIn, conn=Depends(get_conn)):
        routine_write(lambda: routines.add_day_type(conn, body.name, body.weekdays))
        return routines.list_day_types(conn)

    @app.put("/api/day-types/{day_type_id}")
    def put_day_type(day_type_id: int, body: DayTypeChange, conn=Depends(get_conn)):
        routine_write(lambda: routines.update_day_type(conn, day_type_id, body.model_dump(exclude_unset=True)))
        return routines.list_day_types(conn)

    @app.delete("/api/day-types/{day_type_id}")
    def delete_day_type(day_type_id: int, conn=Depends(get_conn)):
        routine_write(lambda: routines.delete_day_type(conn, day_type_id))
        return routines.list_day_types(conn)

    # The plan writes return the day's plan.
    @app.put("/api/plan/{day}/day-type")
    def put_day_type_override(day: str, body: DayOverrideIn, conn=Depends(get_conn)):
        routine_write(lambda: routines.set_day_override(conn, _day(day), body.day_type_id))
        return routines.plan(conn, _day(day))

    @app.put("/api/plan/{day}/blocks/{routine_id}")
    def put_block_log(day: str, routine_id: int, body: BlockLogIn, conn=Depends(get_conn)):
        routine_write(lambda: routines.log_block(conn, routine_id, _day(day), body.status, body.reason))
        return routines.plan(conn, _day(day))

    @app.post("/api/plan/{day}/blocks/{routine_id}/snooze")
    def snooze_block(day: str, routine_id: int, body: BlockSnoozeIn, conn=Depends(get_conn)):
        routine_write(lambda: routines.snooze(conn, routine_id, _day(day), body.until))
        return routines.plan(conn, _day(day))

    @app.get("/api/block-reminders/due")
    def get_block_reminders(now: str | None = None, conn=Depends(get_conn)):
        return routines.due_reminders(conn, _now(now))

    @app.post("/api/block-reminders/{routine_id}/shown")
    def block_reminder_shown(routine_id: int, which: str, now: str | None = None, conn=Depends(get_conn)):
        at = _now(now)
        routine_write(lambda: routines.mark_shown(conn, routine_id, at[:10], which, at[11:16]))
        return {"ok": True}

    def _now(now: str | None) -> str:
        """The user's local time from the app, YYYY-MM-DDTHH:MM."""
        if now is None:
            return datetime.now().strftime("%Y-%m-%dT%H:%M")
        try:
            return datetime.strptime(now, "%Y-%m-%dT%H:%M").strftime("%Y-%m-%dT%H:%M")
        except ValueError:
            raise HTTPException(422, "now must be YYYY-MM-DDTHH:MM")

    def task_write(work):
        try:
            work()
        except KeyError:
            raise HTTPException(404, "no such task")
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    # Every tasks write returns the whole Tasks screen.
    @app.get("/api/tasks")
    def get_tasks(now: str | None = None, conn=Depends(get_conn)):
        return tasks.summary(conn, _now(now))

    @app.post("/api/tasks")
    def post_task(body: TaskIn, now: str | None = None, conn=Depends(get_conn)):
        task_write(lambda: tasks.add(conn, body.model_dump()))
        return tasks.summary(conn, _now(now))

    @app.put("/api/tasks/{task_id}")
    def put_task(task_id: int, body: TaskChange, now: str | None = None, conn=Depends(get_conn)):
        at = _now(now)
        task_write(lambda: tasks.update(conn, task_id, body.model_dump(exclude_unset=True), at))
        return tasks.summary(conn, at)

    @app.post("/api/tasks/{task_id}/snooze")
    def post_snooze(task_id: int, body: SnoozeIn, now: str | None = None, conn=Depends(get_conn)):
        at = _now(now)
        task_write(lambda: tasks.snooze(conn, task_id, body.how, at))
        return tasks.summary(conn, at)

    @app.delete("/api/tasks/{task_id}")
    def delete_task(task_id: int, response: Response, now: str | None = None, conn=Depends(get_conn)):
        undoable(response, conn, "task", task_id, lambda: task_write(lambda: tasks.delete(conn, task_id)))
        return tasks.summary(conn, _now(now))

    @app.post("/api/tasks/{task_id}/subtasks")
    def post_subtask(task_id: int, body: SubtaskIn, now: str | None = None, conn=Depends(get_conn)):
        task_write(lambda: tasks.add_subtask(conn, task_id, body.title, body.due_date))
        return tasks.summary(conn, _now(now))

    @app.put("/api/subtasks/{subtask_id}")
    def put_subtask(subtask_id: int, body: SubtaskChange, now: str | None = None, conn=Depends(get_conn)):
        # Only the fields sent change, so sending "due_date": null clears the date.
        changes = body.model_dump(exclude_unset=True)
        task_write(lambda: tasks.set_subtask(conn, subtask_id, changes.get("done"), **({"due_date": changes["due_date"]} if "due_date" in changes else {})))
        return tasks.summary(conn, _now(now))

    @app.delete("/api/subtasks/{subtask_id}")
    def delete_subtask(subtask_id: int, now: str | None = None, conn=Depends(get_conn)):
        task_write(lambda: tasks.set_subtask(conn, subtask_id, None, delete_it=True))
        return tasks.summary(conn, _now(now))

    @app.get("/api/digest")
    def get_digest(now: str | None = None, conn=Depends(get_conn)):
        return digest.digest(conn, _now(now))

    @app.get("/api/reminders/due")
    def get_due_reminders(now: str | None = None, conn=Depends(get_conn)):
        return tasks.due_reminders(conn, _now(now))

    @app.post("/api/tasks/{task_id}/notified")
    def post_notified(task_id: int, now: str | None = None, conn=Depends(get_conn)):
        task_write(lambda: tasks.mark_notified(conn, task_id, _now(now)))
        return {"ok": True}

    @app.get("/api/health/{day}")
    def get_health(day: str, days: int = 30, conn=Depends(get_conn)):
        if days not in (7, 30, 90):
            raise HTTPException(422, "days must be 7, 30 or 90")
        return health.summary(conn, _day(day), days)

    @app.get("/api/links/{day}")
    def get_links(day: str, days: int = 90, conn=Depends(get_conn)):
        if days not in (30, 90):
            raise HTTPException(422, "days must be 30 or 90")
        return links.links(conn, _day(day), days)

    @app.get("/api/leaks/{day}")
    def get_leaks(day: str, days: int = 30, conn=Depends(get_conn)):
        if days not in (7, 30):
            raise HTTPException(422, "days must be 7 or 30")
        return leaks.time_leaks(conn, _day(day), days)

    @app.get("/api/energy/{day}")
    def get_energy(day: str, conn=Depends(get_conn)):
        return energy.taps_for(conn, _day(day))

    @app.put("/api/energy/{day}/{slot}")
    def put_energy(day: str, slot: str, body: EnergyTapIn, conn=Depends(get_conn)):
        day = _day(day)
        try:
            energy.save_tap(conn, day, slot, body.value, body.at)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return energy.taps_for(conn, day)

    @app.put("/api/health-log/{day}")
    def put_health_log(day: str, body: HealthLogIn, conn=Depends(get_conn)):
        # Only the fields sent change; sending null clears one.
        day = _day(day)
        try:
            health.save_log(conn, day, body.model_dump(exclude_unset=True))
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        return health.summary(conn, day, 30)

    @app.get("/api/monthly")
    def get_monthly(month: str | None = None, today: str | None = None, conn=Depends(get_conn)):
        day = _day(today) if today else date.today().isoformat()
        try:
            return monthly.summary(conn, month or day[:7], day)
        except ValueError as exc:
            raise HTTPException(422, str(exc))

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
            return {"job_id": coach.start(conn, body.skill, goal_id=body.goal_id)}
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        except coach.NothingToReport as exc:
            raise HTTPException(409, str(exc))
        except RuntimeError as exc:
            raise HTTPException(503, str(exc))

    def chat_answer(conn, chat_id: int) -> dict:
        """Start Samuel's reply to the chat's latest message and return the chat."""
        try:
            coach.start(conn, "ask", chat_id)
        except RuntimeError as exc:
            raise HTTPException(503, str(exc))
        return chats.get(conn, chat_id)

    def chat_write(work):
        try:
            return work()
        except LookupError as exc:
            raise HTTPException(404, str(exc))
        except chats.Busy as exc:
            raise HTTPException(409, str(exc))
        except ValueError as exc:
            raise HTTPException(422, str(exc))

    @app.get("/api/search")
    def get_search(q: str = "", conn=Depends(get_conn)):
        return search.search(conn, q[:100])

    @app.get("/api/chats")
    def get_chats(conn=Depends(get_conn)):
        return chats.list_chats(conn)

    @app.post("/api/chats", status_code=201)
    def post_chat(body: ChatIn, conn=Depends(get_conn)):
        if coach.claude_path() is None:
            raise HTTPException(503, "Claude Code is not installed")
        chat_id = chat_write(lambda: chats.create(conn, body.text, body.report_id))
        return chat_answer(conn, chat_id)

    @app.get("/api/chats/{chat_id}")
    def get_chat(chat_id: int, conn=Depends(get_conn)):
        return chat_write(lambda: chats.get(conn, chat_id))

    @app.post("/api/chats/{chat_id}/messages")
    def post_chat_message(chat_id: int, body: ChatMessageIn, conn=Depends(get_conn)):
        if coach.claude_path() is None:
            raise HTTPException(503, "Claude Code is not installed")
        chat_write(lambda: chats.ask(conn, chat_id, body.text))
        return chat_answer(conn, chat_id)

    @app.post("/api/chats/{chat_id}/retry")
    def post_chat_retry(chat_id: int, conn=Depends(get_conn)):
        chat = chat_write(lambda: chats.get(conn, chat_id))
        if chat["pending"] or not chat["awaiting_reply"]:
            raise HTTPException(409, "There's no unanswered question to retry.")
        return chat_answer(conn, chat_id)

    @app.delete("/api/chats/{chat_id}")
    def delete_chat(chat_id: int, response: Response, conn=Depends(get_conn)):
        if chats.pending(conn, chat_id):
            raise HTTPException(409, "Samuel is still answering. Delete the chat once the reply is in.")
        undoable(response, conn, "chat", chat_id, lambda: chat_write(lambda: chats.delete(conn, chat_id)))
        return chats.list_chats(conn)

    @app.get("/api/trash")
    def get_trash(conn=Depends(get_conn)):
        return trash.list_trash(conn)

    @app.post("/api/trash/{trash_id}/restore")
    def post_restore(trash_id: int, conn=Depends(get_conn)):
        try:
            return trash.restore(conn, trash_id)
        except LookupError as exc:
            raise HTTPException(404, str(exc))
        except ValueError as exc:
            raise HTTPException(409, str(exc))

    @app.delete("/api/trash")
    def delete_trash(conn=Depends(get_conn)):
        trash.empty(conn)
        return []

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
