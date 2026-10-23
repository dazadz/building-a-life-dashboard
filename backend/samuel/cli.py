"""The `samuel` command line. Claude Code uses it to read data and write reports."""

import argparse
import json
import random
import re
import sys
from datetime import date, timedelta

from . import db, reports, scores
from .checkins import log_habit, save_checkin


def _days(text: str) -> int:
    m = re.fullmatch(r"(\d+)d?", text)
    if not m or int(m.group(1)) < 1:
        raise argparse.ArgumentTypeError("use a number of days, e.g. 7d")
    return int(m.group(1))


def _date(text: str) -> str:
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        raise argparse.ArgumentTypeError("use YYYY-MM-DD")


def cmd_serve(args) -> None:
    import uvicorn

    from .api import create_app

    db.connect().close()
    print(f"Samuel is running at http://127.0.0.1:{args.port}  (data: {db.data_dir()})")
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port, log_level="warning")


def cmd_export(args) -> None:
    conn = db.connect()
    json.dump(reports.export(conn, args.since, args.until), sys.stdout, indent=1, ensure_ascii=False)
    print()


def cmd_report_add(args) -> None:
    text = sys.stdin.read() if args.file == "-" else open(args.file, encoding="utf-8").read()
    conn = db.connect()
    try:
        report_id = reports.add_report(conn, args.kind, text, args.date)
    except ValueError as exc:
        sys.exit(f"error: {exc}")
    print(f"Saved {args.kind} report #{report_id}")


def cmd_report_list(args) -> None:
    for r in reports.list_reports(db.connect(), args.kind, args.limit):
        first = r["markdown"].splitlines()[0][:70]
        print(f"#{r['id']:<4} {r['kind']:<8} {r['date']}  {first}")


def cmd_scores(args) -> None:
    print(json.dumps(scores.summary(db.connect(), args.date), indent=1))


def cmd_backup(args) -> None:
    print(f"Backup written to {db.backup(db.connect())}")


def cmd_demo(args) -> None:
    conn = db.connect()
    if conn.execute("SELECT COUNT(*) FROM checkins").fetchone()[0] and not args.force:
        sys.exit(
            "This database already has check-ins. Demo data is for an empty database:\n"
            "set SAMUEL_DATA_DIR to a new folder first, or pass --force to mix it in."
        )
    seed_demo(conn, args.days)
    print(f"Added {args.days} days of demo data for Jordan to {db.db_path()}")


def seed_demo(conn, days: int, end: date | None = None) -> None:
    """A made-up persona, Jordan. Never real data."""
    rng = random.Random(7)
    end = end or date.today()
    with conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('name', '\"Jordan\"')")
    distractions = ["Phone", "Social media", "Email", "Meetings", "Noise", "Low energy"]
    wins = ["Shipped the budget draft", "Ran 6 km", "Inbox to zero", "Finished module 7", "Good 1:1 with Marcus"]
    for i in range(days - 1, -1, -1):
        day = (end - timedelta(days=i)).isoformat()
        if i == 0:
            continue  # leave today's check-in for the user to fill in
        sleep = round(rng.uniform(5.6, 8.2), 1)
        energy = max(1, min(10, round(sleep - 2 + rng.uniform(-1, 2))))
        save_checkin(conn, day, {
            "wake_time": f"0{rng.choice([6, 6, 7, 7, 8])}:{rng.choice(['00', '15', '30', '45'])}",
            "sleep_hours": sleep,
            "mood": rng.choice(["flat", "okay", "good", "good", "great"]),
            "energy": energy,
            "main_goal": rng.choice(["Q4 budget proposal", "Onboarding playbook", "Half-marathon long run"]),
            "workout": rng.choice(["yes", "yes", "no", "rest"]),
            "deep_work_hours": round(rng.uniform(0.5, 4.2), 1),
            "productivity": max(1, min(10, energy + rng.choice([-1, 0, 1, 2]))),
            "distraction": rng.choice(distractions),
            "wins": rng.choice(wins),
            "failures": rng.choice(["Skipped reading", "Phone in bed", "Late coffee", ""]),
            "improvement": rng.choice(["Phone out of the bedroom", "Deep work before 10:00", "Last coffee by 14:00"]),
        })
        for key in ("reading", "healthy_eating", "water", "meditation", "no_procrastination", "no_social_media"):
            if rng.random() < 0.85:
                log_habit(conn, day, key, "done" if rng.random() < 0.65 else "missed")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="samuel", description="Samuel, your local performance coach.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("serve", help="run the web app on this computer")
    p.add_argument("--port", type=int, default=8765)
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("export", help="print recent data as JSON")
    p.add_argument("--since", type=_days, default=7, help="number of days, e.g. 7d (default 7d)")
    p.add_argument("--until", type=_date, help="last day to include (default today)")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("report", help="add or list coach reports")
    rsub = p.add_subparsers(dest="report_command", required=True)
    r = rsub.add_parser("add", help="store a report written in markdown")
    r.add_argument("--kind", required=True, choices=reports.KINDS)
    r.add_argument("--file", default="-", help="markdown file, or - for stdin (default)")
    r.add_argument("--date", type=_date, help="the day the report is about (default today)")
    r.set_defaults(func=cmd_report_add)
    r = rsub.add_parser("list", help="list recent reports")
    r.add_argument("--kind", choices=reports.KINDS)
    r.add_argument("--limit", type=int, default=10)
    r.set_defaults(func=cmd_report_list)

    p = sub.add_parser("scores", help="print the scores for a day")
    p.add_argument("--date", type=_date, default=date.today().isoformat())
    p.set_defaults(func=cmd_scores)

    p = sub.add_parser("backup", help="write a dated copy of the database")
    p.set_defaults(func=cmd_backup)

    p = sub.add_parser("demo", help="fill an empty database with the Jordan demo persona")
    p.add_argument("--days", type=int, default=21)
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_demo)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
