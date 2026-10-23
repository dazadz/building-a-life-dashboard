import pytest
from fastapi.testclient import TestClient

from samuel import goals, monthly
from samuel.api import create_app
from samuel.checkins import log_habit, save_checkin
from samuel.reports import export

TODAY = "2026-10-24"


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def test_month_parsing():
    assert monthly.parse_month("2026-10").isoformat() == "2026-10-01"
    assert monthly.previous(monthly.parse_month("2026-01")).isoformat() == "2025-12-01"
    with pytest.raises(ValueError):
        monthly.parse_month("October")


def test_an_empty_month_has_no_numbers_not_zeros(conn):
    n = monthly.numbers(conn, monthly.parse_month("2026-10"), TODAY)
    assert n["days_so_far"] == 24 and n["days_logged"] == 0
    assert n["discipline"] is None and n["sleep"] is None and n["goal_completion"] is None


def test_compares_with_last_month(conn):
    save_checkin(conn, "2026-09-10", {"sleep_hours": 6})
    log_habit(conn, "2026-09-10", "reading", "missed")
    save_checkin(conn, "2026-10-10", {"sleep_hours": 7})
    log_habit(conn, "2026-10-10", "reading", "done")
    s = monthly.summary(conn, "2026-10", TODAY)
    assert s["numbers"]["sleep"] == 7.0 and s["changes"]["sleep"] == 1.0
    reading = next(h for h in s["habits"] if h["key"] == "reading")
    assert (reading["then"], reading["now"], reading["change"]) == (0, 100, 100)
    assert s["previous"] == "2026-09" and s["is_current"] is True


def test_goal_completion_counts_milestones_due_in_the_month(conn):
    gid = goals.add_goal(conn, {"title": "Fund", "area": "financial"}, TODAY)
    a = goals.add_milestone(conn, gid, {"title": "€5k", "due_date": "2026-10-05"})
    goals.add_milestone(conn, gid, {"title": "€10k", "due_date": "2026-10-20"})
    goals.add_milestone(conn, gid, {"title": "€15k", "due_date": "2026-12-01"})
    goals.update_milestone(conn, a, {"done": True}, TODAY)
    n = monthly.numbers(conn, monthly.parse_month("2026-10"), TODAY)
    assert (n["milestones_done"], n["milestones_due"], n["goal_completion"]) == (1, 2, 50)


def test_trend_has_a_seven_day_average(conn):
    for d, status in (("2026-10-01", "done"), ("2026-10-02", "missed")):
        log_habit(conn, d, "reading", status)
    t = monthly.trend(conn, monthly.parse_month("2026-10"), TODAY)
    assert t[0] == {"date": "2026-10-01", "discipline": 100, "average": 100}
    assert t[1]["average"] == 50 and t[2]["discipline"] is None


def test_api_and_export(client, conn):
    assert client.get(f"/api/monthly?month=2026-10&today={TODAY}").json()["month"] == "2026-10"
    assert client.get("/api/monthly?month=oct").status_code == 422
    assert "monthly" not in export(conn, 7, TODAY)
    assert export(conn, 7, TODAY, month=True)["monthly"]["month"] == "2026-10"
