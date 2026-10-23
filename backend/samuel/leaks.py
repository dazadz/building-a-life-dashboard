"""Time leaks from the check-in's biggest distraction. The rules are in docs/scores.md ("Time leaks")."""

import sqlite3
from datetime import date, timedelta

from . import scores

MIN_DAYS = 2
HIGH, MEDIUM = 1 / 3, 0.15


def _avg(xs: list[float]) -> float | None:
    return round(sum(xs) / len(xs), 1) if xs else None


def time_leaks(conn: sqlite3.Connection, day: str, days: int) -> dict:
    start = (date.fromisoformat(day) - timedelta(days=days - 1)).isoformat()
    rows = conn.execute(
        "SELECT date, distraction, deep_work_hours FROM checkins WHERE date BETWEEN ? AND ? ORDER BY date",
        (start, day),
    ).fetchall()
    groups: dict[str, dict] = {}
    for r in rows:
        name = " ".join((r["distraction"] or "").split())
        if not name:
            continue
        g = groups.setdefault(name.lower(), {"name": name, "dates": [], "lost": 0.0, "deep": []})
        g["dates"].append(r["date"])
        if r["deep_work_hours"] is not None:
            target = scores.targets(conn, r["date"])["deep_work_target_hours"]
            g["lost"] += max(0.0, target - r["deep_work_hours"])
            g["deep"].append(r["deep_work_hours"])

    total_lost = sum(g["lost"] for g in groups.values())
    leaks = []
    for key, g in groups.items():
        if len(g["dates"]) < MIN_DAYS:
            continue
        others = [r["deep_work_hours"] for r in rows if r["deep_work_hours"] is not None
                  and " ".join((r["distraction"] or "").split()).lower() != key]
        share = g["lost"] / total_lost if total_lost else 0
        leaks.append({
            "name": g["name"],
            "days": len(g["dates"]),
            "dates": g["dates"],
            "deep_work_lost": round(g["lost"], 1),
            "deep_work_avg": _avg(g["deep"]),
            "deep_work_avg_other_days": _avg(others),
            "impact": "high" if share >= HIGH else "medium" if share >= MEDIUM else "low",
        })
    leaks.sort(key=lambda x: (-x["deep_work_lost"], -x["days"], x["name"].lower()))
    return {"days": days, "checkins": len(rows), "leaks": leaks, "total_lost": round(total_lost, 1)}
