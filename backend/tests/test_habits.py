from datetime import date

from samuel import habits
from samuel.checkins import log_habit

END = date(2026, 10, 24)  # a Saturday


def logs(**by_day):
    """Build logs from keyword days, e.g. d24="done" for 24 October."""
    return {f"2026-10-{k[1:]}": v for k, v in by_day.items()}


def test_streak_counts_back_from_today_or_yesterday():
    assert habits.streak(logs(d22="done", d23="done", d24="done"), END) == 3
    # Today not logged yet: count from yesterday.
    assert habits.streak(logs(d22="done", d23="done"), END) == 2


def test_unlogged_day_ends_a_streak_and_skipped_does_not():
    assert habits.streak(logs(d21="done", d23="done", d24="done"), END) == 2
    assert habits.streak(logs(d21="done", d22="skipped", d23="done", d24="done"), END) == 3
    assert habits.streak(logs(d23="done", d24="missed"), END) == 0


def test_best_streak():
    assert habits.best_streak(logs(d10="done", d11="done", d12="done", d13="missed", d14="done")) == 3
    assert habits.best_streak(logs(d10="done", d11="skipped", d12="done")) == 2
    assert habits.best_streak({}) == 0


def test_rate_ignores_unlogged_and_skipped():
    assert habits.rate(["done", "missed", None, "skipped", "done"]) == 67
    assert habits.rate([None, "skipped"]) is None


def test_patterns_need_three_of_the_last_four():
    # Wednesdays in Oct 2026: 21, 14, 7, and 30 Sep.
    wed = {"2026-10-21": "missed", "2026-10-14": "missed", "2026-10-07": "done", "2026-09-30": "missed"}
    found = habits.patterns({"reading": wed}, {"reading": "Reading done"}, END)
    assert found == [{"key": "reading", "name": "Reading done", "weekday": "Wednesday", "missed": 3, "of": 4}]

    two_of_four = {**wed, "2026-09-30": "done"}
    assert habits.patterns({"reading": two_of_four}, {"reading": "Reading done"}, END) == []


def test_weekly_consistency_needs_three_days():
    week = {"2026-10-19": "done", "2026-10-20": "missed", "2026-10-21": "done"}
    weeks = habits.weekly_consistency({"water": week}, END)
    assert len(weeks) == 8
    assert weeks[-1] == {"week_start": "2026-10-19", "consistency": 67}
    assert weeks[-2]["consistency"] is None


def test_history_endpoint_shape(conn):
    log_habit(conn, "2026-10-23", "reading", "done")
    log_habit(conn, "2026-10-24", "reading", "done")
    h = habits.history(conn, "2026-10-24", 7)
    assert len(h["dates"]) == 7 and h["dates"][-1] == "2026-10-24"
    reading = next(r for r in h["habits"] if r["key"] == "reading")
    assert reading["days"][-2:] == ["done", "done"]
    assert reading["streak"] == 2
    assert reading["rate"] == 100
    assert len(h["habits"]) == 10
