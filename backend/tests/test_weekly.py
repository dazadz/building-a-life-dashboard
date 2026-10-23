import pytest
from fastapi.testclient import TestClient

from samuel import backups, goals, weekly
from samuel.api import create_app
from samuel.checkins import save_checkin
from samuel.reports import export

WEEK = "2026-10-19"  # a Monday
TODAY = "2026-10-24"  # Saturday of that week


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def week_of_checkins(conn):
    save_checkin(conn, "2026-10-20", {"sleep_hours": 7, "deep_work_hours": 2, "energy": 6, "workout": "yes", "wins": "Sent the brief"})
    save_checkin(conn, "2026-10-21", {"sleep_hours": 6, "deep_work_hours": 4.2, "energy": 3, "failures": "Skipped reading"})


def test_default_week_switches_on_friday():
    assert weekly.default_week("2026-10-23") == WEEK  # Friday: this week
    assert weekly.default_week("2026-10-21") == "2026-10-12"  # Wednesday: last week


def test_numbers_from_the_week(conn):
    week_of_checkins(conn)
    n = weekly.numbers(conn, WEEK)
    assert n["checkins"] == 2 and n["sleep_avg"] == 6.5 and n["deep_work_total"] == 6.2 and n["workouts"] == 1


def test_an_empty_week_has_no_numbers_not_zeros(conn):
    n = weekly.numbers(conn, WEEK)
    assert n["day_score"] is None and n["sleep_avg"] is None and n["deep_work_total"] is None and n["habit_rate"] is None


def test_look_back_and_questions(conn):
    week_of_checkins(conn)
    gid = goals.add_goal(conn, {"title": "Onboarding doc", "area": "career"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "Review the doc", "due_date": "2026-10-22"})
    r = weekly.review(conn, WEEK, TODAY)
    assert [w["text"] for w in r["wins"]] == ["Sent the brief"]
    assert "Review the doc" in r["slipped"][-1]["text"]
    asked = [q["question"] for q in r["questions"]]
    assert asked[0].startswith("Wednesday was your best focus day (4.2 h)")
    assert asked[1] == "Review the doc slipped. Keep it, move it, or drop it?"
    assert r["carry_over"][0]["title"] == "Review the doc"


def test_a_milestone_due_later_this_week_has_not_slipped(conn):
    gid = goals.add_goal(conn, {"title": "Half marathon", "area": "fitness"}, TODAY)
    goals.add_milestone(conn, gid, {"title": "14 km long run", "due_date": "2026-10-25"})  # Sunday, after TODAY
    r = weekly.review(conn, WEEK, TODAY)
    assert r["slipped"] == [] and r["carry_over"] == []
    assert not r["questions"][1]["question"].startswith("14 km")


def test_save_keeps_the_questions_it_asked(conn):
    week_of_checkins(conn)
    weekly.save(conn, WEEK, {"differently": "Block mornings"}, ["Ship budget", "", "Run 14 km"], [], "draft", TODAY)
    save_checkin(conn, "2026-10-22", {"deep_work_hours": 6})  # would change the best-day question
    r = weekly.review(conn, WEEK, TODAY)
    assert r["questions"][0]["question"].startswith("Wednesday")
    assert r["questions"][2]["answer"] == "Block mornings"
    assert r["priorities"] == ["Ship budget", "Run 14 km", ""]
    assert r["status"] == "draft"


@pytest.mark.parametrize("kwargs", [
    {"week_start": "2026-10-20"},
    {"status": "finished"},
    {"priorities": ["a", "b", "c", "d"]},
    {"answers": {"nope": "x"}},
])
def test_bad_reviews_are_refused(conn, kwargs):
    args = {"week_start": WEEK, "answers": {}, "priorities": [], "carry": [], "status": "draft", **kwargs}
    with pytest.raises(ValueError):
        weekly.save(conn, args.pop("week_start"), today=TODAY, **args)


def test_api_and_export(client, conn):
    r = client.get(f"/api/weekly?today={TODAY}")
    assert r.json()["week_start"] == WEEK
    r = client.put(f"/api/weekly/{WEEK}?today={TODAY}", json={"answers": {"differently": "Less email"}, "priorities": ["Budget"], "status": "done"})
    assert r.status_code == 200 and r.json()["status"] == "done"
    review = export(conn, 14, TODAY)["weekly_review"]
    assert review["priorities_next_week"] == ["Budget"]
    assert client.put(f"/api/weekly/2026-10-20?today={TODAY}", json={}).status_code == 422


def test_weekly_reviews_are_in_full_exports(conn):
    weekly.save(conn, WEEK, {}, ["Budget"], [], "draft", TODAY)
    assert backups.export_all(conn)["tables"]["weekly_reviews"][0]["week_start"] == WEEK
