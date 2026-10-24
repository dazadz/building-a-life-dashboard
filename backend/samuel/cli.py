"""The `samuel` command line. Claude Code uses it to read data and write reports."""

import argparse
import json
import os
import random
import re
import subprocess
import sys
import threading
from pathlib import Path
from datetime import date, timedelta

from . import backups, chats, db, energy, health, profile, reports, routines, scores, settings, suggestions, tasks
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

    start_background_tasks()
    print(f"Samuel is running at http://127.0.0.1:{args.port}  (data: {db.data_dir()})")
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port, log_level="warning")


def start_background_tasks() -> None:
    """Today's backup now, then a check every hour while the server runs."""
    conn = db.connect()
    backups.daily_backup(conn)
    conn.close()
    threading.Thread(target=_backup_hourly, daemon=True).start()


def cmd_app(args) -> None:
    from . import appwindow

    appwindow.quiet_output_to_log()
    if args.shortcut:
        try:
            print(f"Shortcut created: {appwindow.create_shortcut(args.port)}")
        except (RuntimeError, OSError, subprocess.CalledProcessError) as exc:
            sys.exit(f"Couldn't create the shortcut: {exc}")
        return
    try:
        appwindow.run(args.port)
    except RuntimeError as exc:
        sys.exit(str(exc))


def _backup_hourly() -> None:
    """While the server runs, take the day's backup once the date changes."""
    import time

    while True:
        time.sleep(3600)
        conn = db.connect()
        backups.daily_backup(conn)
        conn.close()


def _coach_run() -> bool:
    """True inside a coach run, where check-in text could try to steer Claude (see coach._env)."""
    return os.environ.get("SAMUEL_COACH") == "1"


def cmd_export(args) -> None:
    if _coach_run() and (args.all or args.out or args.force):
        sys.exit("Coach runs may only read recent data: --all, --out and --force are off.")
    conn = db.connect()
    if not args.all:
        data = reports.export(conn, args.since, args.until, args.sensitive, args.month)
        if args.goal is not None:
            try:
                data["breakdown_goal"] = reports.breakdown_goal(conn, args.goal)
            except LookupError as exc:
                sys.exit(f"error: {exc}")
        if args.chat is not None:
            try:
                data["chat"] = chats.for_coach(conn, args.chat)
            except LookupError as exc:
                sys.exit(f"error: {exc}")
        json.dump(data, sys.stdout, indent=1, ensure_ascii=False)
        print()
        return
    data = backups.export_all(conn)
    if args.out:
        out = Path(args.out).expanduser()
        if backups.inside_git_repo(out.parent) and not args.force:
            sys.exit(
                f"Refusing to write your data inside a git repository ({out.parent}).\n"
                "It could be committed and published by mistake. Choose another folder, or pass --force."
            )
        out.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"Exported everything to {out}. It contains your personal data: keep it private.")
    else:
        if backups.inside_git_repo(Path.cwd()):
            print("Warning: you're inside a git repository. Don't save this export here.", file=sys.stderr)
        json.dump(data, sys.stdout, indent=1, ensure_ascii=False)
        print()


def cmd_import(args) -> None:
    conn = db.connect()
    try:
        data = json.loads(Path(args.file).expanduser().read_text(encoding="utf-8-sig"))
        counts = backups.import_all(conn, data)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        sys.exit(f"Import failed: {exc}")
    print("Imported " + ", ".join(f"{n} {t}" for t, n in counts.items()))


def cmd_report_add(args) -> None:
    if _coach_run() and args.file != "-":
        sys.exit("Coach runs pass reports on stdin (--file -), not from files.")
    if args.file == "-":
        text = sys.stdin.buffer.read().decode("utf-8-sig") if hasattr(sys.stdin, "buffer") else sys.stdin.read()
    else:
        text = open(args.file, encoding="utf-8-sig").read()
    conn = db.connect()
    if args.chat is not None:
        if args.kind != "ask":
            sys.exit("error: --chat is for --kind ask")
        try:
            chats.add_reply(conn, args.chat, text)
        except (LookupError, ValueError) as exc:
            sys.exit(f"error: {exc}")
        print(f"Saved Samuel's reply in chat #{args.chat}")
        return
    try:
        report_id = reports.add_report(conn, args.kind, text, args.date)
    except ValueError as exc:
        sys.exit(f"error: {exc}")
    print(f"Saved {args.kind} report #{report_id}")


def cmd_suggest_add(args) -> None:
    """Store Samuel's suggestions for the user to accept or dismiss. Read from stdin only."""
    raw = sys.stdin.buffer.read().decode("utf-8-sig") if hasattr(sys.stdin, "buffer") else sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        sys.exit(f"error: suggestions must be JSON ({exc.msg})")
    items = data.get("suggestions") if isinstance(data, dict) else data
    batch = data.get("batch") if isinstance(data, dict) else None
    try:
        result = suggestions.add_many(db.connect(), items, batch)
    except ValueError as exc:
        sys.exit(f"error: {exc}")
    skipped = f" ({result['skipped']} already suggested before)" if result["skipped"] else ""
    print(f"Saved {result['added']} suggestions for the user to review{skipped}")


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
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarded', 'true')")
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
        if rng.random() < 0.7:
            health.save_log(conn, day, {
                "water_l": round(rng.uniform(1.0, 2.6), 1), "caffeine_cups": rng.choice([1, 2, 2, 3, 4]),
                "caffeine_last": rng.choice(["11:30", "13:00", "14:30", "15:45", "16:10"]),
                "screens_late": rng.choice([0, 20, 35, 50, 75]),
            })
        for key in ("reading", "healthy_eating", "water", "meditation", "no_procrastination", "no_social_media"):
            if rng.random() < 0.85:
                log_habit(conn, day, key, "done" if rng.random() < 0.65 else "missed")
    seed_demo_goals(conn, end)
    seed_demo_profile(conn)
    if not routines.list_routines(conn):
        routines.add_suggested(conn, end.isoformat())
    seed_demo_tasks(conn, end)
    seed_demo_energy(conn, end)
    seed_demo_plan(conn, end)


def seed_demo_plan(conn, end: date) -> None:
    """What Jordan told Samuel, Jordan's pains and goals, and a few suggestions waiting for review."""
    from . import about

    on = lambda n: (end + timedelta(days=n)).isoformat()  # noqa: E731
    about.set_notes(conn, "Office Mon–Wed in the city, home Thu–Fri.\nRun club Saturdays at 08:00. Family dinner Sundays at 18:00.\n"
                          "I think best before lunch; after 15:00 I only manage admin.\nMy knee gets sore past 15 km.")
    office = routines.add_day_type(conn, "Office day", [0, 1, 2])
    routines.add_day_type(conn, "Home day", [3, 4])
    routines.add(conn, {"name": "Commute", "start": "07:45", "end": "08:30", "kind": "fixed", "day_type_id": office,
                        "note": "Podcast or a book", "remind_before": False, "remind_start": False})
    blocks = {b["name"]: b["id"] for b in routines.list_routines(conn)}
    if "Deep work 1" in blocks:
        routines.update(conn, blocks["Deep work 1"], {"steps": ["Phone in another room", "Open the task list", "Two 50-minute sessions"]})
        tasks.add(conn, {"title": "Draft the Q4 budget summary", "routine_id": blocks["Deep work 1"], "due_date": on(-1),
                         "notes": "Two pages, numbers from the shared sheet"})
    walk = settings.add_habit(conn, "Walk after lunch")
    lights = settings.add_habit(conn, "Lights out by 23:00")
    goal_ids = {r["title"]: r["id"] for r in conn.execute("SELECT id, title FROM goals")}
    for item in (
        {"kind": "pain", "text": "Afternoon slump after lunch", "area": "Energy", "evidence": "Energy taps fall from 7 to 4 after 14:00", "habit_key": walk},
        {"kind": "pain", "text": "Evenings lost to the phone", "area": "Focus", "evidence": "Phone is the top distraction on 9 of 21 days", "habit_key": "no_social_media"},
        {"kind": "pain", "text": "Late to bed on weeknights", "area": "Sleep", "evidence": "Under 6.5 h of sleep on 4 of the last 7 nights", "habit_key": lights},
        {"kind": "goal", "text": "Promotion to senior analyst", "area": "Career", "evidence": "Top goal for the next 3 months", "goal_id": goal_ids.get("Promotion to senior analyst")},
        {"kind": "goal", "text": "Half marathon in March", "area": "Fitness", "evidence": "Runs 3–4 times a week already", "goal_id": goal_ids.get("Half marathon in March")},
    ):
        about.add(conn, item)
    suggestions.add_many(conn, [
        {"kind": "routine", "reason": "Focus scored higher on days you started before 09:00.",
         "payload": {"name": "Deep work at home", "start": "08:30", "end": "10:30", "weekdays": [3, 4], "day_type": "Home day",
                     "note": "Phone in another room", "steps": ["Phone in another room", "Hardest task first"]}},
        {"kind": "routine", "reason": "Your energy taps drop between 14:00 and 16:00.",
         "payload": {"name": "Walk and coffee outside", "start": "15:30", "end": "15:45", "weekdays": [0, 1, 2]}},
        {"kind": "habit", "reason": "You want two phone-free evenings a week.", "payload": {"name": "Phone on the charger in the hall"}},
        {"kind": "task", "reason": "Next step for the side project; fits Deep work on Friday.",
         "payload": {"title": "Write the landing page copy", "due_date": on(2), "goal_title": "Launch side-project MVP", "block": "Deep work 1"}},
        {"kind": "task", "reason": "You noted knee soreness after long runs twice.", "payload": {"title": "Book a physio check", "due_date": on(4)}},
    ], batch="plan")


def seed_demo_energy(conn, end: date) -> None:
    """Jordan's energy taps: strong mornings, a dip after lunch. Its own random stream, so other demo data stays the same."""
    rng = random.Random(11)
    for i in range(20, 0, -1):
        day = (end - timedelta(days=i)).isoformat()
        for slot, base, at in (("morning", 7, "08:40"), ("midday", 6, "12:20"), ("afternoon", 4, "15:10"), ("evening", 5, "20:30")):
            if rng.random() < 0.75:
                energy.save_tap(conn, day, slot, max(1, min(10, base + rng.randint(-1, 2))), at)


def seed_demo_tasks(conn, end: date) -> None:
    """Jordan's to-do list, dated around `end`."""
    def on(days: int) -> str:
        return (end + timedelta(days=days)).isoformat()

    goal = conn.execute("SELECT id FROM goals WHERE title = 'Promotion to senior analyst'").fetchone()
    demo = [
        {"title": "Add hiring costs to Q4 budget", "list": "Work", "priority": "high", "due_date": on(0), "due_time": "14:00",
         "remind_at": f"{on(0)}T13:45", "goal_id": goal["id"] if goal else None,
         "notes": "Pull the three open roles from the hiring plan and add salary bands plus a 15% recruiting buffer.",
         "subtasks": ["Export hiring plan", "Add salary bands for 3 roles", "Add recruiting buffer"]},
        {"title": "Reply to Sarah about the vendor contract", "list": "Work", "due_date": on(0), "remind_at": f"{on(0)}T16:00"},
        {"title": "Book physio appointment", "list": "Personal", "due_date": on(0)},
        {"title": "Send expense report", "list": "Work", "priority": "high", "due_date": on(-1)},
        {"title": "Buy running gels for Sunday", "list": "Personal", "due_date": on(1)},
        {"title": "Draft section 3 of onboarding playbook", "list": "Work", "due_date": on(3)},
        {"title": "Call the bank about the savings rate", "list": "Personal", "priority": "low", "due_date": on(5)},
    ]
    for t in demo:
        tasks.add(conn, t)
    done = tasks.add(conn, {"title": "Renew passport", "list": "Personal", "due_date": on(-3)})
    tasks.update(conn, done, {"done": True}, f"{on(-3)}T18:00")


def seed_demo_profile(conn) -> None:
    """Jordan has finished the first section and is part-way through the second, as in the design."""
    profile.save(conn, "life", {
        "age": 29, "occupation": "Analyst at a logistics company", "work_pattern": "Hybrid", "living": "Partner",
        "care": "No", "satisfaction": 6, "stress": 7, "discipline": 5,
        "frustrations": "No time for myself, always tired in the evenings",
        "one_change": "A calm evening routine and real sleep",
    }, done=True)
    profile.save(conn, "routine", {
        "wake_time": "06:45", "sleep_time": "23:30", "work_hours": 9, "exercise": "1–2×", "focus_span": "30–60",
        "screen_time": 7, "social_media": 2, "time_wasted": 1.5,
    })


def seed_demo_goals(conn, end: date) -> None:
    """Jordan's goals, with dates relative to `end` so the demo always looks current."""
    def on(days: int) -> str:
        return (end + timedelta(days=days)).isoformat()

    demo = [
        ("Half marathon in March", "fitness", 4, 4, on(140), [
            ("10 km in under 60 min", on(-30), True), ("12 km long run", on(-10), True),
            ("14 km long run", on(1), False), ("16 km long run", on(21), False), ("Race day", on(140), False),
        ]),
        ("€15k emergency fund", "financial", 5, 2, on(200), [
            ("Reach €5k", on(-40), True), ("Reach €10k", on(7), False), ("Reach €15k", on(200), False),
        ]),
        ("Promotion to senior analyst", "career", 5, 4, on(120), [
            ("Ask manager for criteria", on(-25), True), ("Ship Q4 budget proposal", on(2), False),
            ("Lead the January planning", on(80), False), ("Promotion review", on(120), False),
        ]),
        ("Python for data course", "learning", 3, 2, on(15), [
            ("Modules 1–4", on(-35), True), ("Modules 5–7", on(-5), True), ("Module 8: pandas", on(15), False),
        ]),
        ("Launch side-project MVP", "business", 4, 5, on(37), [
            ("Pick the idea", on(-20), True), ("Landing page live", on(37), False),
            ("First 10 sign-ups", on(70), False), ("Ship the MVP", on(110), False),
        ]),
        ("Dinner with friends weekly", "social", 2, 1, None, [
            ("Book November dates", on(6), False),
        ]),
    ]
    with conn:
        for title, area, impact, effort, target, milestones in demo:
            cur = conn.execute(
                "INSERT INTO goals (title, area, impact, effort, target_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (title, area, impact, effort, target, on(-60)),
            )
            for m_title, due, done in milestones:
                conn.execute(
                    "INSERT INTO milestones (goal_id, title, due_date, done_date) VALUES (?, ?, ?, ?)",
                    (cur.lastrowid, m_title, due, due if done else None),
                )
        conn.execute(
            "INSERT INTO goals (title, area, impact, effort, target_date, done_date, created_at) "
            "VALUES ('Read 12 books', 'learning', 2, 2, ?, ?, ?)", (on(-15), on(-15), on(-200)),
        )
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('vision', ?)",
            ('"By 2030: financially independent, fit enough to run a marathon, and running my own product studio."',),
        )


def main(argv: list[str] | None = None) -> None:
    db.allow_real_folder()
    parser = argparse.ArgumentParser(prog="samuel", description="Samuel, your local performance coach.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("serve", help="run the web app on this computer")
    p.add_argument("--port", type=int, default=8765)
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("app", help="open Samuel in its own window, starting the server if needed")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--shortcut", action="store_true", help="create a desktop shortcut for this (Windows)")
    p.set_defaults(func=cmd_app)

    p = sub.add_parser("export", help="print recent data as JSON, or everything with --all")
    p.add_argument("--since", type=_days, default=7, help="number of days, e.g. 7d (default 7d)")
    p.add_argument("--until", type=_date, help="last day to include (default today)")
    p.add_argument("--all", action="store_true", help="export all data, for moving or restoring")
    p.add_argument("--out", help="with --all: write to this file instead of the screen")
    p.add_argument("--force", action="store_true", help="allow --out inside a git repository")
    p.add_argument("--sensitive", action="store_true",
                   help="include the health and mental health profile answers (onboarding insights and plan builder only)")
    p.add_argument("--month", action="store_true", help="include this month compared with last month")
    p.add_argument("--chat", type=int, help="include this chat's conversation (for the ask skill)")
    p.add_argument("--goal", type=int, help="include this goal in full, to break it down (for the plan builder)")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("import", help="restore an export made with export --all into an empty database")
    p.add_argument("file")
    p.set_defaults(func=cmd_import)

    p = sub.add_parser("report", help="add or list coach reports")
    rsub = p.add_subparsers(dest="report_command", required=True)
    r = rsub.add_parser("add", help="store a report written in markdown")
    r.add_argument("--kind", required=True, choices=reports.KINDS)
    r.add_argument("--file", default="-", help="markdown file, or - for stdin (default)")
    r.add_argument("--date", type=_date, help="the day the report is about (default today)")
    r.add_argument("--chat", type=int, help="with --kind ask: save the text as Samuel's reply in this chat")
    r.set_defaults(func=cmd_report_add)
    r = rsub.add_parser("list", help="list recent reports")
    r.add_argument("--kind", choices=reports.KINDS)
    r.add_argument("--limit", type=int, default=10)
    r.set_defaults(func=cmd_report_list)

    p = sub.add_parser("suggest", help="propose goals, habits, tasks and routine blocks for the user to approve")
    ssub = p.add_subparsers(dest="suggest_command", required=True)
    r = ssub.add_parser("add", help='read {"batch": ..., "suggestions": [...]} as JSON from stdin')
    r.add_argument("--file", default="-", choices=["-"], help="always - (stdin)")
    r.set_defaults(func=cmd_suggest_add)

    p = sub.add_parser("scores", help="print the scores for a day")
    p.add_argument("--date", type=_date, default=date.today().isoformat())
    p.set_defaults(func=cmd_scores)

    p = sub.add_parser("backup", help="write a dated copy of the database")
    p.set_defaults(func=cmd_backup)

    p = sub.add_parser("demo", help="fill an empty database with the Jordan demo persona")
    p.add_argument("--days", type=int, default=21)
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_demo)

    # Reports and exports are UTF-8 whatever the Windows console code page is.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
