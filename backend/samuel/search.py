"""Search for the Ctrl+K palette: tasks, goals, milestones, check-ins, reports and chats."""

import sqlite3

PER_GROUP = 5
SNIPPET = 90
CHECKIN_FIELDS = ("main_goal", "wins", "failures", "improvement", "distraction")
FIELD_LABEL = {"main_goal": "Main goal", "wins": "Wins", "failures": "Failures",
               "improvement": "Improvement", "distraction": "Distraction"}


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def snippet(text: str, q: str) -> str:
    """A short window of text around the first match."""
    flat = " ".join(text.split())
    at = flat.lower().find(q.lower())
    if at < 0 or len(flat) <= SNIPPET:
        return flat[:SNIPPET] + ("…" if len(flat) > SNIPPET else "")
    start = max(0, at - SNIPPET // 3)
    end = min(len(flat), start + SNIPPET)
    return ("…" if start else "") + flat[start:end] + ("…" if end < len(flat) else "")


def search(conn: sqlite3.Connection, q: str) -> dict:
    q = " ".join(q.split())
    if len(q) < 2:
        return {"query": q, "groups": []}
    like = _like(q)
    esc = "ESCAPE '\\'"
    groups = []

    rows = conn.execute(
        f"""SELECT id, title, list, priority, due_date, due_time, done_at FROM tasks
            WHERE title LIKE ? {esc} OR notes LIKE ? {esc}
            ORDER BY done_at IS NOT NULL, due_date IS NULL, due_date, id DESC LIMIT ?""",
        (like, like, PER_GROUP),
    ).fetchall()
    groups.append({"name": "Tasks", "items": [{
        "kind": "task", "id": r["id"], "title": r["title"], "href": "#/tasks",
        "meta": " · ".join(x for x in (
            "Done" if r["done_at"] else (r["due_date"] or "No date"),
            r["due_time"], r["list"], "High priority" if r["priority"] == "high" else None,
        ) if x),
    } for r in rows]})

    goals = [{
        "kind": "goal", "id": r["id"], "title": r["title"], "href": "#/goals",
        "meta": f"Goal · {r['area'].capitalize()}" + (" · done" if r["done_date"] else ""),
    } for r in conn.execute(
        f"SELECT id, title, area, done_date FROM goals WHERE title LIKE ? {esc} ORDER BY done_date IS NOT NULL, id DESC LIMIT ?",
        (like, PER_GROUP),
    )]
    goals += [{
        "kind": "milestone", "id": r["id"], "title": r["title"], "href": "#/goals",
        "meta": f"Milestone of {r['goal']}" + (f" · due {r['due_date']}" if r["due_date"] else ""),
    } for r in conn.execute(
        f"""SELECT m.id, m.title, m.due_date, g.title AS goal FROM milestones m JOIN goals g ON g.id = m.goal_id
            WHERE m.title LIKE ? {esc} ORDER BY m.done_date IS NOT NULL, m.due_date LIMIT ?""",
        (like, PER_GROUP),
    )]
    groups.append({"name": "Goals", "items": goals[:PER_GROUP]})

    where = " OR ".join(f"{f} LIKE ? {esc}" for f in CHECKIN_FIELDS)
    items = []
    for r in conn.execute(
        f"SELECT date, {', '.join(CHECKIN_FIELDS)} FROM checkins WHERE {where} ORDER BY date DESC LIMIT ?",
        (*[like] * len(CHECKIN_FIELDS), PER_GROUP),
    ):
        field = next(f for f in CHECKIN_FIELDS if r[f] and q.lower() in r[f].lower())
        items.append({
            "kind": "checkin", "id": r["date"], "title": r["date"], "href": f"#/checkin?date={r['date']}",
            "meta": f"{FIELD_LABEL[field]}: “{snippet(r[field], q)}”",
        })
    groups.append({"name": "Check-ins", "items": items})

    groups.append({"name": "Reports", "items": [{
        "kind": "report", "id": r["id"], "title": (r["markdown"].splitlines() or [""])[0].lstrip("# ").strip() or r["kind"],
        "href": f"#/coach?report={r['id']}", "meta": snippet(r["markdown"], q),
    } for r in conn.execute(
        f"SELECT id, kind, markdown FROM reports WHERE markdown LIKE ? {esc} ORDER BY created_at DESC, id DESC LIMIT ?",
        (like, PER_GROUP),
    )]})

    groups.append({"name": "Chats", "items": [{
        "kind": "chat", "id": r["id"], "title": r["title"], "href": f"#/coach?chat={r['id']}",
        "meta": snippet(r["text"], q),
    } for r in conn.execute(
        f"""SELECT c.id, c.title, m.text, MAX(m.id) FROM chats c JOIN chat_messages m ON m.chat_id = c.id
            WHERE m.text LIKE ? {esc} OR c.title LIKE ? {esc} GROUP BY c.id ORDER BY c.id DESC LIMIT ?""",
        (like, like, PER_GROUP),
    )]})

    return {"query": q, "groups": [g for g in groups if g["items"]]}
