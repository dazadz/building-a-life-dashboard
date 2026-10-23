"""Energy taps and the energy curve. The rules are in the "Health & energy" section of docs/scores.md."""

import re
import sqlite3
from datetime import date, timedelta

SLOTS = ("morning", "midday", "afternoon", "evening")
STARTS = {"morning": "00:00", "midday": "11:00", "afternoon": "14:00", "evening": "18:00"}
MIN_DAYS = 3
HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")


def slot_at(hhmm: str) -> str:
    """The slot a local time falls in."""
    found = SLOTS[0]
    for slot in SLOTS:
        if hhmm >= STARTS[slot]:
            found = slot
    return found


def save_tap(conn: sqlite3.Connection, day: str, slot: str, value: int | None, at: str) -> None:
    """Save or clear one tap. A new tap in the same slot replaces the old one."""
    if slot not in SLOTS:
        raise ValueError(f"slot must be one of {', '.join(SLOTS)}")
    if not HHMM.fullmatch(at):
        raise ValueError("at must be HH:MM")
    with conn:
        if value is None:
            conn.execute("DELETE FROM energy_taps WHERE date = ? AND slot = ?", (day, slot))
            return
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 10:
            raise ValueError("value must be a whole number from 1 to 10")
        conn.execute(
            "INSERT INTO energy_taps (date, slot, value, at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT (date, slot) DO UPDATE SET value = excluded.value, at = excluded.at",
            (day, slot, value, at),
        )


def taps_for(conn: sqlite3.Connection, day: str) -> dict:
    found = {r["slot"]: r["value"] for r in conn.execute("SELECT slot, value FROM energy_taps WHERE date = ?", (day,))}
    return {slot: found.get(slot) for slot in SLOTS}


def curve(conn: sqlite3.Connection, day: str, days: int) -> dict:
    start = (date.fromisoformat(day) - timedelta(days=days - 1)).isoformat()
    rows = conn.execute(
        "SELECT slot, AVG(value) AS avg, COUNT(*) AS n FROM energy_taps WHERE date BETWEEN ? AND ? GROUP BY slot",
        (start, day),
    ).fetchall()
    stats = {r["slot"]: r for r in rows}
    points = [{
        "slot": slot,
        "average": round(stats[slot]["avg"], 1) if slot in stats and stats[slot]["n"] >= MIN_DAYS else None,
        "days": stats[slot]["n"] if slot in stats else 0,
    } for slot in SLOTS]
    shown = [p for p in points if p["average"] is not None]
    peak = dip = None
    if len(shown) >= 2:
        peak = max(shown, key=lambda p: (p["average"], -SLOTS.index(p["slot"])))["slot"]
        dip = min(shown, key=lambda p: (p["average"], SLOTS.index(p["slot"])))["slot"]
    return {"points": points, "peak": peak, "dip": dip, "min_days": MIN_DAYS}
