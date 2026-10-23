"""Health & energy: Recovery, Burnout risk, sleep and energy, and the quick health log.

Every rule is in the "Health & energy" section of docs/scores.md; change that first.
"""

import re
import sqlite3
from datetime import date, timedelta

from . import energy, scores

LOG_FIELDS = ("water_l", "caffeine_cups", "caffeine_last", "screens_late")
LIMITS = {"water_l": (0, 10), "caffeine_cups": (0, 20), "screens_late": (0, 600)}
HHMM = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
SHORT_SLEEP = 6.5


def _back(day: str, n: int) -> list[str]:
    """`day` and the n - 1 days before it, oldest first."""
    d = date.fromisoformat(day)
    return [(d - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]


def _avg(xs: list[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def validate_log(changes: dict) -> dict:
    clean = {}
    for key, value in changes.items():
        if key not in LOG_FIELDS:
            raise ValueError(f"unknown field {key}")
        if value is None:
            clean[key] = None
        elif key == "caffeine_last":
            if not isinstance(value, str) or not HHMM.fullmatch(value):
                raise ValueError("caffeine_last must be HH:MM")
            clean[key] = value
        else:
            lo, hi = LIMITS[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not lo <= value <= hi:
                raise ValueError(f"{key} must be between {lo} and {hi}")
            clean[key] = int(value) if key != "water_l" else float(value)
    return clean


def save_log(conn: sqlite3.Connection, day: str, changes: dict) -> None:
    """Upsert: only the fields sent change, so saving never blanks a value you didn't touch."""
    clean = validate_log(changes)
    if not clean:
        return
    with conn:
        conn.execute("INSERT OR IGNORE INTO health_logs (date) VALUES (?)", (day,))
        conn.execute(f"UPDATE health_logs SET {', '.join(f'{k} = ?' for k in clean)} WHERE date = ?", [*clean.values(), day])


def log_for(conn: sqlite3.Connection, day: str) -> dict | None:
    row = conn.execute("SELECT * FROM health_logs WHERE date = ?", (day,)).fetchone()
    return dict(row) if row else None


def _day(conn: sqlite3.Connection, day: str) -> dict:
    checkin = scores.checkin_row(conn, day)
    targets = scores.targets(conn, day)
    v = scores.inputs(checkin, {}, targets)
    return {
        "date": day, "checkin": checkin, "targets": targets, "v": v,
        "stress": scores.scores_for(conn, day)["stress"], "log": log_for(conn, day),
    }


def recovery(conn: sqlite3.Connection, day: str) -> int | None:
    last3 = [_day(conn, d) for d in _back(day, 3)]
    week = [_day(conn, d) for d in _back(day, 7)]
    sleep = _avg([d["v"]["sleep"] for d in last3 if d["v"]["sleep"] is not None])
    stress = _avg([d["stress"] for d in last3 if d["stress"] is not None])
    energy = _avg([d["v"]["energy"] for d in last3 if d["v"]["energy"] is not None])
    checkins = [d["checkin"] for d in week if d["checkin"]]
    rest = min(sum(1 for c in checkins if c["workout"] == "rest") / 2, 1.0) if len(checkins) >= 3 else None
    value = scores.weighted([
        (sleep, 0.40),
        (None if stress is None else 1 - (stress - 1) / 9, 0.25),
        (energy, 0.15),
        (rest, 0.20),
    ])
    return None if value is None else round(100 * value)


def burnout(conn: sqlite3.Connection, day: str) -> dict:
    week = [_day(conn, d) for d in _back(day, 7)]
    before = [_day(conn, d) for d in _back((date.fromisoformat(day) - timedelta(days=7)).isoformat(), 7)]
    checked = [d for d in week if d["checkin"]]
    if len(checked) < 3:
        return {"level": None, "reasons": []}
    reasons = []

    run = best = 0
    for d in week:
        c = d["checkin"]
        short = c is not None and c["sleep_hours"] is not None and c["sleep_hours"] < d["targets"]["sleep_target_hours"] - 1
        run = run + 1 if short else 0
        best = max(best, run)
    if best >= 3:
        reasons.append(f"{best} short nights in a row")

    streak = 0
    for d in reversed(_back(day, 30)):
        c = scores.checkin_row(conn, d)
        if c is None:
            continue
        if c["workout"] == "rest":
            break
        streak += 1
    if streak >= 7:
        reasons.append(f"No rest day for {streak} check-in days")

    stress = _avg([d["stress"] for d in checked if d["stress"] is not None])
    if stress is not None and stress >= 6:
        reasons.append(f"Stress averaged {stress:.1f} / 10")

    now_e = _avg([d["checkin"]["energy"] for d in checked if d["checkin"]["energy"] is not None])
    then_e = _avg([d["checkin"]["energy"] for d in before if d["checkin"] and d["checkin"]["energy"] is not None])
    if now_e is not None and then_e is not None and now_e <= then_e - 1.5:
        reasons.append(f"Energy down {then_e - now_e:.1f} points on the week before")

    late = sum(1 for d in week if d["log"] and d["log"]["caffeine_last"] and d["log"]["caffeine_last"] > "15:00")
    if late >= 3:
        reasons.append(f"Caffeine after 15:00 on {late} days")

    long_days = sum(
        1 for d in checked
        if d["checkin"]["deep_work_hours"] is not None
        and d["checkin"]["deep_work_hours"] > d["targets"]["deep_work_target_hours"] + 2
    )
    if long_days >= 3:
        reasons.append(f"Deep work over target by 2 h+ on {long_days} days")

    level = "low" if not reasons else "moderate" if len(reasons) <= 2 else "high"
    return {"level": level, "reasons": reasons}


def sleep_energy(conn: sqlite3.Connection, day: str, days: int) -> dict:
    series = []
    short, enough = [], []
    for d in _back(day, days):
        c = scores.checkin_row(conn, d)
        sleep = c["sleep_hours"] if c else None
        energy = c["energy"] if c else None
        series.append({"date": d, "sleep": sleep, "energy": energy})
        if sleep is not None and energy is not None:
            (short if sleep < SHORT_SLEEP else enough).append(energy)
    gap = round(_avg(enough) - _avg(short), 1) if len(short) >= 2 and len(enough) >= 2 else None
    return {"series": series, "energy_gap": gap}


def inputs_week(conn: sqlite3.Connection, day: str) -> dict:
    logs = [log for log in (log_for(conn, d) for d in _back(day, 7)) if log]
    checkins = [c for c in (scores.checkin_row(conn, d) for d in _back(day, 7)) if c]

    def avg(key, digits=1):
        vals = [log[key] for log in logs if log[key] is not None]
        return round(sum(vals) / len(vals), digits) if vals else None

    lasts = sorted(log["caffeine_last"] for log in logs if log["caffeine_last"])
    return {
        "water_l": avg("water_l"),
        "caffeine_cups": avg("caffeine_cups"),
        "caffeine_latest": lasts[-1] if lasts else None,
        "screens_late": avg("screens_late", 0),
        "workouts": sum(1 for c in checkins if c["workout"] == "yes"),
        "logged_days": len(logs),
    }


def summary(conn: sqlite3.Connection, day: str, days: int) -> dict:
    week_ago = (date.fromisoformat(day) - timedelta(days=7)).isoformat()
    today_r = recovery(conn, day)
    then_r = recovery(conn, week_ago)
    week = [scores.checkin_row(conn, d) for d in _back(day, 7)]
    checkins = [c for c in week if c]
    sleep = [c["sleep_hours"] for c in checkins if c["sleep_hours"] is not None]
    stress = [s for s in (scores.scores_for(conn, d)["stress"] for d in _back(day, 7)) if s is not None]
    return {
        "date": day,
        "days": days,
        "sleep_target": scores.targets(conn, day)["sleep_target_hours"],
        "recovery": {
            "score": today_r,
            "change": today_r - then_r if today_r is not None and then_r is not None else None,
            "sleep_avg": round(sum(sleep) / len(sleep), 1) if sleep else None,
            "rest_days": sum(1 for c in checkins if c["workout"] == "rest"),
            "stress_avg": round(sum(stress) / len(stress), 1) if stress else None,
            "workouts": sum(1 for c in checkins if c["workout"] == "yes"),
        },
        "burnout": burnout(conn, day),
        **sleep_energy(conn, day, days),
        "inputs": inputs_week(conn, day),
        "log_today": log_for(conn, day),
        "energy_curve": energy.curve(conn, day, days),
        "taps_today": energy.taps_for(conn, day),
    }


def for_coach(conn: sqlite3.Connection, day: str) -> dict:
    s = summary(conn, day, 7)
    return {
        "recovery": s["recovery"], "burnout": s["burnout"], "energy_gap_short_sleep": s["energy_gap"], "inputs": s["inputs"],
        # Average energy taps by time of day over 30 days (slots with fewer than 3 days are null).
        "energy_curve_30d": energy.curve(conn, day, 30),
    }
