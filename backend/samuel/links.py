"""What moves your energy and mood: plain with/without comparisons from your own days.

The rules are in docs/scores.md ("What moves your energy and mood"); change that first.
"""

import sqlite3
from datetime import date, timedelta

from . import health, scores

MOOD = {"low": 1, "flat": 2, "okay": 3, "good": 4, "great": 5}
MIN_DAYS = 3
TOP = 6
# Outcome: (label, unit, smallest difference that shows, range used to rank)
OUTCOMES = {
    "energy": ("Energy", "/10", 0.8, 9),
    "mood": ("Mood", "/5", 0.4, 4),
    "productivity": ("Productivity", "/10", 0.8, 9),
    "sleep": ("Sleep", "h", 0.3, 3),
}
# Condition, outcome, day offset (0 same day, 1 next day)
LINKS = [
    ("sleep_target", "energy", 0), ("sleep_target", "mood", 0), ("sleep_target", "productivity", 0),
    ("workout", "mood", 0), ("workout", "energy", 1),
    ("deep_work_target", "mood", 0),
    ("late_caffeine", "sleep", 1), ("late_caffeine", "energy", 1),
    ("late_screens", "sleep", 1), ("late_screens", "energy", 1),
]
CONDITIONS = {
    "sleep_target": ("Slept to target", "nights under target"),
    "workout": ("Worked out", "no workout"),
    "deep_work_target": ("Hit your deep work target", "under target"),
    "late_caffeine": ("Caffeine after 15:00", "last cup by 15:00"),
    "late_screens": ("30+ min of screens after 22:00", "less than 30 min"),
}


def _condition(key: str, checkin: dict | None, log: dict | None, targets: dict) -> bool | None:
    """True, False, or None when the day has no answer for it."""
    c = checkin or {}
    if key == "sleep_target":
        return None if c.get("sleep_hours") is None else c["sleep_hours"] >= targets["sleep_target_hours"]
    if key == "workout":
        return {"yes": True, "no": False}.get(c.get("workout"))
    if key == "deep_work_target":
        return None if c.get("deep_work_hours") is None else c["deep_work_hours"] >= targets["deep_work_target_hours"]
    if key == "late_caffeine":
        if not log or log.get("caffeine_cups") is None:
            return None
        return bool(log["caffeine_cups"]) and (log.get("caffeine_last") or "00:00") > "15:00"
    if key == "late_screens":
        return None if not log or log.get("screens_late") is None else log["screens_late"] >= 30
    raise ValueError(key)


def _outcome(key: str, checkin: dict | None) -> float | None:
    c = checkin or {}
    if key == "mood":
        return MOOD.get(c.get("mood"))
    if key == "sleep":
        return c.get("sleep_hours")
    return c.get(key)


def links(conn: sqlite3.Connection, day: str, days: int) -> dict:
    end = date.fromisoformat(day)
    span = [(end - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    checkins = {d: scores.checkin_row(conn, d) for d in span}
    logs = {d: health.log_for(conn, d) for d in span}
    targets = {d: scores.targets(conn, d) for d in span}

    found = []
    for cond, out, offset in LINKS:
        with_, without = [], []
        for d in span:
            later = (date.fromisoformat(d) + timedelta(days=offset)).isoformat()
            if later > day:
                continue
            flag = _condition(cond, checkins[d], logs[d], targets[d])
            value = _outcome(out, checkins[later])
            if flag is None or value is None:
                continue
            (with_ if flag else without).append(value)
        if len(with_) < MIN_DAYS or len(without) < MIN_DAYS:
            continue
        a, b = sum(with_) / len(with_), sum(without) / len(without)
        label, unit, threshold, scale = OUTCOMES[out]
        diff = a - b
        if abs(diff) < threshold:
            continue
        found.append({
            "condition": cond, "condition_label": CONDITIONS[cond][0], "compared_with": CONDITIONS[cond][1],
            "outcome": out, "outcome_label": label, "unit": unit,
            "when": "next day" if offset else "same day",
            "with_avg": round(a, 1), "without_avg": round(b, 1), "difference": round(diff, 1),
            "with_days": len(with_), "without_days": len(without),
            "strength": round(abs(diff) / scale, 3),
        })
    found.sort(key=lambda x: -x["strength"])
    return {"days": days, "min_days": MIN_DAYS, "links": found[:TOP]}
