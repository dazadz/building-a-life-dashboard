"""Samuel's suggestions: pains, goals, milestones, habits, tasks and routine blocks waiting for the user.

The coach can only add suggestions (`samuel suggest add`). Nothing changes the user's data until they
accept one, and each one is validated when it arrives and again when it's accepted, so text in a
check-in can at most make Samuel *propose* something (see docs/adr/0004).
"""

import json
import sqlite3
from datetime import datetime, timezone

from . import about, goals, routines, settings, tasks

KINDS = ("pain", "goal", "milestone", "habit", "task", "routine")
MAX_PER_RUN = 25
MAX_MILESTONES = 8
MAX_SUBTASKS = 10
REASON_MAX = 300
BATCH_MAX = 60


def _goal_id(conn: sqlite3.Connection, title) -> int | None:
    """An active goal by its title. The coach knows goals by title, not id."""
    if not isinstance(title, str) or not title.strip():
        return None
    row = conn.execute(
        "SELECT id FROM goals WHERE lower(title) = lower(?) AND done_date IS NULL ORDER BY id DESC", (title.strip(),),
    ).fetchone()
    return row["id"] if row else None


def _pick(payload: dict, keys) -> dict:
    return {k: payload[k] for k in keys if k in payload}


def check(conn: sqlite3.Connection, kind: str, payload) -> tuple[str, dict]:
    """Validate a suggestion the way accepting it would. Returns its title and the clean payload."""
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {', '.join(KINDS)}")
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    if kind == "pain":
        clean = about.validate(conn, _pick(payload, ("text", "area", "evidence")))
        if "text" not in clean:
            raise ValueError("a pain needs a text")
        for link in ("habit_name", "goal_title"):
            if isinstance(payload.get(link), str) and payload[link].strip():
                clean[link] = payload[link].strip()[:120]
        return clean["text"], clean

    if kind == "goal":
        clean = goals.validate_goal(_pick(payload, goals.GOAL_FIELDS))
        if "title" not in clean or "area" not in clean:
            raise ValueError("a goal needs a title and an area")
        milestones = payload.get("milestones") or []
        if not isinstance(milestones, list) or len(milestones) > MAX_MILESTONES:
            raise ValueError(f"a goal can come with up to {MAX_MILESTONES} milestones")
        clean["milestones"] = []
        for m in milestones:
            ms = goals.validate_goal(_pick(m, goals.MILESTONE_FIELDS)) if isinstance(m, dict) else {}
            if "title" not in ms:
                raise ValueError("each milestone needs a title")
            clean["milestones"].append(ms)
        return clean["title"], clean

    if kind == "milestone":
        clean = goals.validate_goal(_pick(payload, goals.MILESTONE_FIELDS))
        if "title" not in clean:
            raise ValueError("a milestone needs a title")
        if _goal_id(conn, payload.get("goal_title")) is None:
            raise ValueError("a milestone needs the title of one of your active goals")
        clean["goal_title"] = payload["goal_title"].strip()
        return clean["title"], clean

    if kind == "habit":
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > settings.HABIT_NAME_MAX:
            raise ValueError(f"a habit name is 1 to {settings.HABIT_NAME_MAX} characters")
        return name.strip(), {"name": name.strip()}

    if kind == "task":
        fields = _pick(payload, tasks.FIELDS)
        fields.pop("goal_id", None)  # linked by title or name below, never by id
        fields.pop("routine_id", None)
        clean = tasks.validate(conn, fields)
        if "title" not in clean:
            raise ValueError("a task needs a title")
        subtasks = payload.get("subtasks") or []
        if (not isinstance(subtasks, list) or len(subtasks) > MAX_SUBTASKS
                or any(not isinstance(s, str) or not s.strip() or len(s) > 200 for s in subtasks)):
            raise ValueError(f"a task can have up to {MAX_SUBTASKS} subtasks of 1 to 200 characters")
        clean["subtasks"] = [s.strip() for s in subtasks]
        _names(payload, clean, ("goal_title", "block"))
        return clean["title"], clean

    fields = {k: v for k, v in _pick(payload, routines.FIELDS).items() if k not in ("goal_id", "habit_key", "day_type_id")}
    clean = routines.validate(fields)
    if not {"name", "start", "end"} <= set(clean):
        raise ValueError("a routine block needs a name, a start and an end")
    clean.setdefault("weekdays", list(range(7)))
    _names(payload, clean, ("goal_title", "habit_name", "day_type"))
    return clean["name"], clean


def _names(payload: dict, clean: dict, keys) -> None:
    """Keep the names that link a suggestion to a goal, habit, day type or block once accepted."""
    for key in keys:
        if isinstance(payload.get(key), str) and payload[key].strip():
            clean[key] = payload[key].strip()[:120]


def _routine_id(conn: sqlite3.Connection, name) -> int | None:
    if not isinstance(name, str) or not name.strip():
        return None
    row = conn.execute("SELECT id FROM routines WHERE lower(name) = lower(?) ORDER BY id", (name.strip(),)).fetchone()
    return row["id"] if row else None


def _known(conn: sqlite3.Connection) -> set[tuple[str, str]]:
    """Suggestions already waiting or dismissed, so Samuel doesn't repeat itself."""
    rows = conn.execute("SELECT kind, lower(title) AS t FROM suggestions WHERE status IN ('pending', 'dismissed')")
    return {(r["kind"], r["t"]) for r in rows}


def add_many(conn: sqlite3.Connection, items, batch: str | None = None) -> dict:
    """Add suggestions from the coach. All are checked first; one bad item rejects the lot."""
    if not isinstance(items, list) or not items:
        raise ValueError("send a list of suggestions")
    if len(items) > MAX_PER_RUN:
        raise ValueError(f"at most {MAX_PER_RUN} suggestions at a time")
    if batch is not None and (not isinstance(batch, str) or not batch.strip() or len(batch) > BATCH_MAX):
        raise ValueError(f"batch must be 1 to {BATCH_MAX} characters")
    ready = []
    for n, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise ValueError(f"suggestion {n}: expected an object")
        reason = item.get("reason")
        if reason is not None and (not isinstance(reason, str) or len(reason) > REASON_MAX):
            raise ValueError(f"suggestion {n}: reason must be at most {REASON_MAX} characters")
        try:
            title, clean = check(conn, item.get("kind"), item.get("payload"))
        except ValueError as exc:
            raise ValueError(f"suggestion {n}: {exc}") from None
        ready.append((item["kind"], title, clean, (reason or "").strip() or None))

    known = _known(conn)
    added = skipped = 0
    with conn:
        for kind, title, clean, reason in ready:
            if (kind, title.lower()) in known:
                skipped += 1
                continue
            known.add((kind, title.lower()))
            conn.execute(
                "INSERT INTO suggestions (kind, title, payload, reason, batch) VALUES (?, ?, ?, ?, ?)",
                (kind, title, json.dumps(clean, ensure_ascii=False), reason, batch.strip() if batch else None),
            )
            added += 1
    return {"added": added, "skipped": skipped}


def _row(r: sqlite3.Row) -> dict:
    return {**dict(r), "payload": json.loads(r["payload"])}


def get(conn: sqlite3.Connection, suggestion_id: int) -> dict:
    row = conn.execute("SELECT * FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    if row is None:
        raise KeyError(suggestion_id)
    return _row(row)


def _pending(conn: sqlite3.Connection, suggestion_id: int) -> dict:
    s = get(conn, suggestion_id)
    if s["status"] != "pending":
        raise ValueError(f"this suggestion was already {s['status']}")
    return s


def _apply(conn: sqlite3.Connection, kind: str, clean: dict, reason: str | None, today: str) -> int:
    if kind == "pain":
        habit = settings.habit_key_by_name(conn, clean["habit_name"]) if clean.get("habit_name") else None
        goal = _goal_id(conn, clean.get("goal_title"))
        return about.add(conn, {"kind": "pain", **_pick(clean, ("text", "area", "evidence")), "habit_key": habit, "goal_id": goal})
    if kind == "goal":
        goal_id = goals.add_goal(conn, clean, today)
        for m in clean["milestones"]:
            goals.add_milestone(conn, goal_id, m)
        area = clean["area"].capitalize()
        about.add(conn, {"kind": "goal", "text": clean["title"], "area": area, "evidence": reason and reason[:300], "goal_id": goal_id})
        return goal_id
    if kind == "milestone":
        goal_id = _goal_id(conn, clean["goal_title"])
        if goal_id is None:
            raise ValueError("that goal is no longer active")
        return goals.add_milestone(conn, goal_id, clean)
    if kind == "habit":
        return conn.execute("SELECT id FROM habits WHERE key = ?", (settings.add_habit(conn, clean["name"]),)).fetchone()["id"]
    if kind == "task":
        fields = {k: v for k, v in clean.items() if k not in ("goal_title", "block")}
        fields["goal_id"] = _goal_id(conn, clean.get("goal_title"))
        fields["routine_id"] = _routine_id(conn, clean.get("block"))
        return tasks.add(conn, fields)
    fields = {k: v for k, v in clean.items() if k not in ("goal_title", "habit_name", "day_type")}
    fields["goal_id"] = _goal_id(conn, clean.get("goal_title"))
    fields["habit_key"] = settings.habit_key_by_name(conn, clean["habit_name"]) if clean.get("habit_name") else None
    if clean.get("day_type"):
        # A day type Samuel names is created on accept, with the block's weekdays as its days.
        fields["day_type_id"] = (routines.day_type_id_by_name(conn, clean["day_type"])
                                 or routines.add_day_type(conn, clean["day_type"], clean["weekdays"]))
    return routines.add(conn, fields)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def accept(conn: sqlite3.Connection, suggestion_id: int, today: str, edited: dict | None = None) -> int:
    """Create what the suggestion describes, optionally as the user edited it. Returns the new row's id."""
    s = _pending(conn, suggestion_id)
    title, clean = check(conn, s["kind"], edited if edited is not None else s["payload"])
    result_id = _apply(conn, s["kind"], clean, s["reason"], today)
    with conn:
        conn.execute(
            "UPDATE suggestions SET status = 'accepted', result_id = ?, decided_at = ?, title = ?, payload = ? WHERE id = ?",
            (result_id, _now(), title, json.dumps(clean, ensure_ascii=False), suggestion_id),
        )
    return result_id


def dismiss(conn: sqlite3.Connection, suggestion_id: int) -> None:
    _pending(conn, suggestion_id)
    with conn:
        conn.execute("UPDATE suggestions SET status = 'dismissed', decided_at = ? WHERE id = ?", (_now(), suggestion_id))


def summary(conn: sqlite3.Connection) -> dict:
    pending = [_row(r) for r in conn.execute("SELECT * FROM suggestions WHERE status = 'pending' ORDER BY id")]
    return {
        "pending": pending,
        "counts": {k: sum(1 for s in pending if s["kind"] == k) for k in KINDS},
        "total": len(pending),
    }


def for_coach(conn: sqlite3.Connection) -> dict:
    """What Samuel has already suggested, so it doesn't repeat ideas the user is weighing or turned down."""
    def titles(status: str, limit: int) -> list[dict]:
        rows = conn.execute(
            "SELECT kind, title FROM suggestions WHERE status = ? ORDER BY id DESC LIMIT ?", (status, limit),
        )
        return [{"kind": r["kind"], "title": r["title"]} for r in rows]

    return {"pending": titles("pending", 50), "dismissed": titles("dismissed", 60), "accepted": titles("accepted", 30)}


LIST_KEYS = ("steps", "subtasks")  # several values on one line, separated by |
INT_KEYS = ("impact", "effort")
BOOL_KEYS = ("remind_before", "remind_start")


def parse_text(text: str) -> tuple[str | None, list[dict]]:
    """Read suggestions written as plain `key: value` lines, the format coach runs use.

    Claude Code blocks shell commands that contain JSON braces, so the coach sends this instead:

        batch: plan
        ---
        kind: routine
        reason: Your energy dips after 14:00.
        name: Walk outside
        start: 15:30
        end: 15:45
        weekdays: 0 1 2
        steps: Leave the phone | Walk 10 minutes
        ---
        kind: goal
        title: Run a half marathon
        area: fitness
        milestone: 10 km in under an hour | 2026-11-20

    Each suggestion starts with `kind:`; `---` lines are optional separators. `milestone:` repeats.
    """
    batch: str | None = None
    items: list[dict] = []
    current: dict | None = None
    for n, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#") or line == "---":
            if line == "---":
                current = None
            continue
        key, sep, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if not sep or not key:
            raise ValueError(f"line {n}: write it as 'key: value'")
        if key == "batch" and not items:
            batch = value or None
        elif key == "kind":
            current = {"kind": value, "payload": {}}
            items.append(current)
        elif current is None:
            raise ValueError(f"line {n}: start each suggestion with 'kind:'")
        elif key == "reason":
            current["reason"] = value
        elif key == "block_kind":  # a routine block's own kind; `kind:` starts a new suggestion
            current["payload"]["kind"] = value
        elif key == "milestone":
            title, _, due = value.partition("|")
            milestone = {"title": title.strip()}
            if due.strip():
                milestone["due_date"] = due.strip()
            current["payload"].setdefault("milestones", []).append(milestone)
        elif key in LIST_KEYS:
            current["payload"][key] = [part.strip() for part in value.split("|") if part.strip()]
        elif key == "weekdays":
            try:
                current["payload"][key] = [int(d) for d in value.replace(",", " ").split()]
            except ValueError:
                raise ValueError(f"line {n}: weekdays are numbers, 0 = Monday … 6 = Sunday") from None
        elif key in INT_KEYS:
            if not value.isdigit():
                raise ValueError(f"line {n}: {key} is a number from 1 to 5")
            current["payload"][key] = int(value)
        elif key in BOOL_KEYS:
            if value.lower() not in ("yes", "no", "true", "false"):
                raise ValueError(f"line {n}: {key} is yes or no")
            current["payload"][key] = value.lower() in ("yes", "true")
        else:
            current["payload"][key] = value
    return batch, items
