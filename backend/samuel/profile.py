"""The full onboarding: 45 questions in four sections that tell Samuel who the user is.

This file is the one place the questions live. The web app renders whatever it gets from
`/api/profile`, and the coach reads the answers through `samuel export`.
"""

import json
import re
import sqlite3

# Question types: text, long (multi-line), number, time (HH:MM), scale (1-10), choice (one), multi (several).
# `sensitive` answers go to Claude only for onboarding insights (`samuel export --sensitive`).
SECTIONS = [
    {
        "key": "life", "title": "Life structure", "minutes": 3,
        "intro": "Where your life stands today. Rough answers are fine; you can change them later.",
        "questions": [
            {"key": "age", "group": "About you", "label": "Age", "type": "number", "min": 14, "max": 100},
            {"key": "occupation", "group": "About you", "label": "What do you do?", "type": "text",
             "placeholder": "Analyst at a logistics company"},
            {"key": "work_pattern", "group": "About you", "label": "How do you work?", "type": "choice",
             "options": ["Office", "Hybrid", "Remote", "Shifts", "Student", "Not working"]},
            {"key": "living", "group": "About you", "label": "Who do you live with?", "type": "choice",
             "options": ["Alone", "Partner", "Family", "Housemates", "Parents"]},
            {"key": "care", "group": "About you", "label": "Do you look after anyone?", "type": "choice",
             "options": ["No", "Children", "Someone else", "Both"]},
            {"key": "satisfaction", "group": "How it feels", "label": "Life satisfaction", "type": "scale"},
            {"key": "stress", "group": "How it feels", "label": "Stress lately", "type": "scale"},
            {"key": "discipline", "group": "How it feels", "label": "How disciplined are you, honestly?", "type": "scale"},
            {"key": "frustrations", "group": "What to change", "label": "What frustrates you most right now?",
             "type": "long", "placeholder": "No time for myself, always tired"},
            {"key": "one_change", "group": "What to change", "label": "If one thing changed in 3 months, what would it be?",
             "type": "long"},
        ],
    },
    {
        "key": "routine", "title": "Daily routine", "minutes": 4,
        "intro": "How does a normal weekday run? Rough answers are fine; you can change them later.",
        "questions": [
            {"key": "wake_time", "group": "Your day", "label": "Wake-up time", "type": "time"},
            {"key": "sleep_time", "group": "Your day", "label": "Sleep time", "type": "time"},
            {"key": "work_hours", "group": "Your day", "label": "Work or study hours", "type": "number",
             "min": 0, "max": 18, "step": 0.5, "unit": "h"},
            {"key": "morning_routine", "group": "Your day", "label": "Morning routine", "type": "long",
             "placeholder": "Coffee, check phone in bed, shower, commute"},
            {"key": "exercise", "group": "Your day", "label": "Exercise per week", "type": "choice",
             "options": ["Never", "1–2×", "3–4×", "5+"]},
            {"key": "focus_span", "group": "Your day", "label": "Usual focus before a break (minutes)", "type": "choice",
             "options": ["15–30", "30–60", "60–90", "90+"]},
            {"key": "screen_time", "group": "Screens and attention", "label": "Screen time per day", "type": "number",
             "min": 0, "max": 20, "step": 0.5, "unit": "h"},
            {"key": "social_media", "group": "Screens and attention", "label": "Social media per day", "type": "number",
             "min": 0, "max": 20, "step": 0.5, "unit": "h"},
            {"key": "time_wasted", "group": "Screens and attention", "label": "Time wasted per day", "type": "number",
             "min": 0, "max": 20, "step": 0.5, "unit": "h"},
            {"key": "productive_hours", "group": "Screens and attention", "label": "Most productive hours", "type": "multi",
             "options": ["Early morning", "Late morning", "Afternoon", "Evening", "Late night"]},
            {"key": "distractions", "group": "Screens and attention", "label": "Biggest distractions", "type": "multi",
             "options": ["Phone", "Social media", "Email", "Meetings", "Noise", "People", "Low energy"]},
            {"key": "meal_times", "group": "Body and breaks", "label": "Meal times", "type": "text",
             "placeholder": "08:00, 13:00, 20:00"},
            {"key": "water", "group": "Body and breaks", "label": "Water per day", "type": "number",
             "min": 0, "max": 8, "step": 0.25, "unit": "L"},
            {"key": "breaks", "group": "Body and breaks", "label": "Break habits", "type": "long"},
            {"key": "current_habits", "group": "Body and breaks", "label": "Current habits, good and bad", "type": "long"},
        ],
    },
    {
        "key": "health", "title": "Health & energy", "minutes": 3,
        "intro": "How your body and energy hold up. Samuel is a coach, not a clinician, and this is not medical advice.",
        "questions": [
            {"key": "sleep_quality", "group": "Sleep and energy", "label": "Sleep quality", "type": "scale"},
            {"key": "energy", "group": "Sleep and energy", "label": "Energy on a normal day", "type": "scale"},
            {"key": "energy_dip", "group": "Sleep and energy", "label": "When does your energy dip?", "type": "choice",
             "options": ["Morning", "Early afternoon", "Late afternoon", "Evening", "No dip"]},
            {"key": "exercise_types", "group": "Movement and food", "label": "What exercise do you do?", "type": "multi",
             "options": ["Running", "Gym", "Cycling", "Swimming", "Team sports", "Yoga", "Walking", "None"]},
            {"key": "diet", "group": "Movement and food", "label": "How well do you eat?", "type": "scale"},
            {"key": "caffeine", "group": "Movement and food", "label": "Coffee or energy drinks per day", "type": "choice",
             "options": ["None", "1", "2", "3", "4+"]},
            {"key": "alcohol", "group": "Movement and food", "label": "Alcoholic drinks per week", "type": "choice",
             "options": ["None", "1–3", "4–7", "8+"]},
            {"key": "recovery", "group": "Recovery", "label": "How do you recover?", "type": "multi",
             "options": ["Rest days", "Time outdoors", "Hobbies", "Social time", "Meditation", "Nothing regular"]},
            {"key": "limitations", "group": "Recovery", "label": "Injuries, conditions or limits Samuel should respect",
             "type": "long", "optional": True, "sensitive": True},
            {"key": "mental_health", "group": "Recovery", "label": "Anything about your mental health Samuel should keep in mind",
             "type": "long", "optional": True, "sensitive": True},
        ],
    },
    {
        "key": "goals", "title": "Goals & ambition", "minutes": 4,
        "intro": "Where you want to go. Samuel plans your days around this.",
        "questions": [
            {"key": "goal_3m", "group": "Horizons", "label": "Your top goal for the next 3 months", "type": "long"},
            {"key": "goal_1y", "group": "Horizons", "label": "Where do you want to be in a year?", "type": "long"},
            {"key": "goal_5y", "group": "Horizons", "label": "And in 5 years?", "type": "long"},
            {"key": "career", "group": "By area", "label": "Career goal", "type": "long"},
            {"key": "financial", "group": "By area", "label": "Financial goal", "type": "long"},
            {"key": "fitness", "group": "By area", "label": "Fitness goal", "type": "long"},
            {"key": "growth", "group": "By area", "label": "Learning or personal growth", "type": "long"},
            {"key": "dream", "group": "What drives you", "label": "Your biggest dream", "type": "long"},
            {"key": "blockers", "group": "What drives you", "label": "What usually stops you?", "type": "long"},
            {"key": "push", "group": "What drives you", "label": "How should Samuel push you?", "type": "choice",
             "options": ["Gentle", "Direct", "Tough love"]},
        ],
    },
]

BY_SECTION = {s["key"]: s for s in SECTIONS}
TOTAL = sum(len(s["questions"]) for s in SECTIONS)
TEXT_MAX = {"text": 200, "long": 2000}


def _question(section: str, key: str) -> dict:
    for q in BY_SECTION[section]["questions"]:
        if q["key"] == key:
            return q
    raise ValueError(f"unknown question {key}")


def validate(q: dict, value):
    """The clean value, or None to clear the answer. Raises ValueError for a bad one."""
    if value is None or value == "" or value == []:
        return None
    kind = q["type"]
    if kind in ("text", "long"):
        if not isinstance(value, str):
            raise ValueError(f"{q['label']}: expected text")
        value = value.strip()
        if len(value) > TEXT_MAX[kind]:
            raise ValueError(f"{q['label']}: at most {TEXT_MAX[kind]} characters")
        return value or None
    if kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not q["min"] <= value <= q["max"]:
            raise ValueError(f"{q['label']}: a number from {q['min']} to {q['max']}")
        return value
    if kind == "scale":
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 10:
            raise ValueError(f"{q['label']}: a whole number from 1 to 10")
        return value
    if kind == "time":
        if not isinstance(value, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
            raise ValueError(f"{q['label']}: use HH:MM")
        return value
    if kind == "choice":
        if value not in q["options"]:
            raise ValueError(f"{q['label']}: pick one of the options")
        return value
    if kind == "multi":
        if not isinstance(value, list) or any(v not in q["options"] for v in value):
            raise ValueError(f"{q['label']}: pick from the options")
        return [o for o in q["options"] if o in value]  # keep the options' order, drop repeats
    raise ValueError(f"unknown question type {kind}")


def answers(conn: sqlite3.Connection) -> dict[str, dict]:
    out: dict[str, dict] = {s["key"]: {} for s in SECTIONS}
    for r in conn.execute("SELECT section, question, value FROM profile_answers"):
        if r["section"] in out:
            out[r["section"]][r["question"]] = json.loads(r["value"])
    return out


def done_sections(conn: sqlite3.Connection) -> list[str]:
    row = conn.execute("SELECT value FROM settings WHERE key = 'profile_done'").fetchone()
    return json.loads(row["value"]) if row else []


def save(conn: sqlite3.Connection, section: str, changes: dict, done: bool | None = None) -> None:
    if section not in BY_SECTION:
        raise KeyError(section)
    clean = {key: validate(_question(section, key), value) for key, value in changes.items()}
    with conn:
        for key, value in clean.items():
            if value is None:
                conn.execute("DELETE FROM profile_answers WHERE section = ? AND question = ?", (section, key))
            else:
                conn.execute(
                    "INSERT INTO profile_answers (section, question, value) VALUES (?, ?, ?) "
                    "ON CONFLICT (section, question) DO UPDATE SET value = excluded.value, "
                    "updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')",
                    (section, key, json.dumps(value)),
                )
        if done is not None:
            finished = set(done_sections(conn))
            finished = finished | {section} if done else finished - {section}
            ordered = [s["key"] for s in SECTIONS if s["key"] in finished]
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('profile_done', ?)", (json.dumps(ordered),))


def _hours_between(start: str, end: str) -> float:
    """Hours from `start` to `end` on a 24-hour clock, e.g. 23:30 to 07:00 is 7.5."""
    h1, m1 = map(int, start.split(":"))
    h2, m2 = map(int, end.split(":"))
    return round(((h2 * 60 + m2 - h1 * 60 - m1) % (24 * 60)) / 60, 1)


def snapshot(section: str, a: dict) -> list[dict]:
    """Key numbers straight from the answers, shown as soon as a section is saved. No formulas."""
    def item(label, value, note=None):
        return {"label": label, "value": value, "note": note}

    out_of_10 = lambda k: f"{a[k]} / 10" if k in a else None  # noqa: E731
    if section == "life":
        return [item("Satisfaction", out_of_10("satisfaction")), item("Stress", out_of_10("stress")),
                item("Self-rated discipline", out_of_10("discipline")), item("Work", a.get("work_pattern"))]
    if section == "routine":
        night = _hours_between(a["sleep_time"], a["wake_time"]) if "sleep_time" in a and "wake_time" in a else None
        wasted = a.get("time_wasted")
        return [
            item("Time in bed", f"{night} h" if night is not None else None),
            item("Screen time", f"{a['screen_time']} h" if "screen_time" in a else None,
                 f"{a['social_media']} h social" if "social_media" in a else None),
            item("Time wasted", f"{wasted} h a day" if wasted is not None else None,
                 f"{round(wasted * 7, 1)} h a week" if wasted is not None else None),
            item("Focus block", f"{a['focus_span']} min" if "focus_span" in a else None),
        ]
    if section == "health":
        return [item("Sleep quality", out_of_10("sleep_quality")), item("Energy", out_of_10("energy")),
                item("Energy dip", a.get("energy_dip")), item("Caffeine a day", a.get("caffeine"))]
    if section == "goals":
        horizons = sum(1 for k in ("goal_3m", "goal_1y", "goal_5y") if k in a)
        areas = sum(1 for k in ("career", "financial", "fitness", "growth") if k in a)
        return [item("Horizons set", f"{horizons} of 3"), item("Areas with a goal", f"{areas} of 4"),
                item("Coaching style", a.get("push"))]
    return []


def summary(conn: sqlite3.Connection) -> dict:
    given = answers(conn)
    finished = done_sections(conn)
    sections = []
    for s in SECTIONS:
        a = given[s["key"]]
        sections.append({
            "key": s["key"], "title": s["title"], "intro": s["intro"], "minutes": s["minutes"],
            "questions": [{**q, "answer": a.get(q["key"])} for q in s["questions"]],
            "answered": len(a), "total": len(s["questions"]), "done": s["key"] in finished,
            "snapshot": snapshot(s["key"], a),
        })
    return {"sections": sections, "answered": sum(s["answered"] for s in sections), "total": TOTAL}


def for_coach(conn: sqlite3.Connection, sensitive: bool = False) -> dict:
    """Answers by section title and question label. Sensitive answers only when asked for."""
    given = answers(conn)
    out = {}
    for s in SECTIONS:
        section = {
            q["label"]: given[s["key"]][q["key"]]
            for q in s["questions"]
            if q["key"] in given[s["key"]] and (sensitive or not q.get("sensitive"))
        }
        if section:
            out[s["title"]] = section
    return {"done": done_sections(conn), "answers": out}
