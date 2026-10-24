from fastapi.testclient import TestClient

from samuel import leaks, reports, settings
from samuel.api import create_app
from samuel.checkins import save_checkin


def fill(conn):
    settings.update(conn, {"deep_work_target_hours": 3}, "2026-10-01")
    for day, distraction, deep in [
        ("2026-10-18", "Phone", 1.0), ("2026-10-19", "Phone", 2.0), ("2026-10-20", "phone ", 1.5),
        ("2026-10-21", "Meetings", 2.5), ("2026-10-22", "Meetings", None), ("2026-10-23", "Email", 4.0),
        ("2026-10-24", "Noise", 0.5),
    ]:
        save_checkin(conn, day, {"distraction": distraction, "deep_work_hours": deep})


def test_leaks_rank_by_deep_work_lost(conn):
    fill(conn)
    result = leaks.time_leaks(conn, "2026-10-24", 7)
    # Lost: Phone 2 + 1 + 1.5 = 4.5, Meetings 0.5 (the unanswered day is left out), Noise 2.5 (1 day: not listed).
    assert [(x["name"], x["days"], x["deep_work_lost"], x["impact"]) for x in result["leaks"]] == [
        ("Phone", 3, 4.5, "high"), ("Meetings", 2, 0.5, "low")]
    assert result["total_lost"] == 7.5
    phone = result["leaks"][0]
    assert phone["deep_work_avg"] == 1.5 and phone["deep_work_avg_other_days"] == 2.3  # Meetings 2.5, Email 4, Noise 0.5


def test_leaks_only_count_the_period_and_no_loss_is_low(conn):
    fill(conn)
    assert leaks.time_leaks(conn, "2026-10-17", 7)["leaks"] == []
    settings.update(conn, {"deep_work_target_hours": 0.5}, "2026-10-01")
    assert {x["impact"] for x in leaks.time_leaks(conn, "2026-10-24", 7)["leaks"]} == {"low"}


def test_leaks_api_and_coach_export(conn):
    fill(conn)
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765")
    assert client.get("/api/leaks/2026-10-24?days=30").json()["leaks"][0]["name"] == "Phone"
    assert client.get("/api/leaks/2026-10-24?days=5").status_code == 422
    assert reports.export(conn, 7, "2026-10-24")["time_leaks_30d"]["leaks"][0]["name"] == "Phone"
