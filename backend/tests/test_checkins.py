from samuel import scores
from samuel.checkins import habits_for, log_habit, save_checkin

DAY = "2026-10-20"


def status(conn, key):
    return {h["key"]: h["status"] for h in habits_for(conn, DAY)}[key]


def test_blank_never_overwrites(conn):
    save_checkin(conn, DAY, {"sleep_hours": 7, "wins": "Ran 6 km"})
    saved = save_checkin(conn, DAY, {"sleep_hours": None, "wins": "  ", "energy": 6})
    assert saved["sleep_hours"] == 7
    assert saved["wins"] == "Ran 6 km"
    assert saved["energy"] == 6


def test_zero_is_a_real_answer(conn):
    saved = save_checkin(conn, DAY, {"deep_work_hours": 0})
    assert saved["deep_work_hours"] == 0
    assert status(conn, "deep_work") == "missed"


def test_auto_tick(conn):
    save_checkin(conn, DAY, {"wake_time": "07:05", "sleep_hours": 6, "deep_work_hours": 3.5, "workout": "rest"})
    assert status(conn, "wake_on_time") == "done"
    assert status(conn, "sleep_target") == "missed"
    assert status(conn, "deep_work") == "done"
    assert status(conn, "workout") == "skipped"
    assert status(conn, "reading") is None


def test_manual_log_wins_over_auto(conn):
    save_checkin(conn, DAY, {"sleep_hours": 6})
    log_habit(conn, DAY, "sleep_target", "done")
    save_checkin(conn, DAY, {"sleep_hours": 5})
    assert status(conn, "sleep_target") == "done"


def test_streak_and_consistency(conn):
    for d in ("2026-10-18", "2026-10-19", "2026-10-20"):
        save_checkin(conn, d, {"energy": 5})
        log_habit(conn, d, "reading", "done")
        log_habit(conn, d, "water", "missed")
    assert scores.checkin_streak(conn, "2026-10-20") == 3
    assert scores.checkin_streak(conn, "2026-10-21") == 3  # today not done yet
    assert scores.consistency(conn, "2026-10-20") == 50
    assert scores.consistency(conn, "2026-10-19") is None  # only 2 days of logs
