from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from samuel import backups, health
from samuel.api import create_app
from samuel.checkins import save_checkin
from samuel.reports import export

TODAY = "2026-10-24"


def day(n: int) -> str:
    return (date.fromisoformat(TODAY) - timedelta(days=n)).isoformat()


@pytest.fixture
def client():
    return TestClient(create_app(allowed_hosts={"testserver"}))


def test_no_data_means_no_scores_not_zero(conn):
    assert health.recovery(conn, TODAY) is None
    assert health.burnout(conn, TODAY) == {"level": None, "reasons": []}


def test_recovery_from_good_days(conn):
    for n in range(7):
        save_checkin(conn, day(n), {"sleep_hours": 7.5, "energy": 10, "mood": "great", "workout": "rest" if n in (1, 4) else "yes"})
    assert health.recovery(conn, TODAY) == 100


def test_recovery_without_rest_data_uses_the_other_parts(conn):
    save_checkin(conn, TODAY, {"sleep_hours": 7.5, "energy": 10, "mood": "great"})
    assert health.recovery(conn, TODAY) == 100  # rest unknown (only 1 check-in), shared out


def test_burnout_flags_and_levels(conn):
    for n in range(8):
        save_checkin(conn, day(n), {"sleep_hours": 5.5, "energy": 3, "mood": "low", "workout": "yes", "deep_work_hours": 6})
    b = health.burnout(conn, TODAY)
    assert b["level"] == "high"
    assert "7 short nights in a row" in b["reasons"]
    assert any(r.startswith("No rest day for 8") for r in b["reasons"])
    assert any(r.startswith("Stress averaged") for r in b["reasons"])
    assert any(r.startswith("Deep work over target") for r in b["reasons"])


def test_a_good_week_is_low_risk(conn):
    for n in range(7):
        save_checkin(conn, day(n), {"sleep_hours": 8, "energy": 8, "mood": "good", "workout": "rest" if n == 2 else "yes"})
    assert health.burnout(conn, TODAY) == {"level": "low", "reasons": []}


def test_late_caffeine_flag_comes_from_the_health_log(conn):
    for n in range(4):
        save_checkin(conn, day(n), {"sleep_hours": 8, "energy": 8, "mood": "good", "workout": "rest"})
        health.save_log(conn, day(n), {"caffeine_last": "16:10"})
    assert health.burnout(conn, TODAY)["reasons"] == ["Caffeine after 15:00 on 4 days"]


def test_sleep_energy_gap_needs_two_days_each_side(conn):
    save_checkin(conn, day(0), {"sleep_hours": 6, "energy": 4})
    save_checkin(conn, day(1), {"sleep_hours": 8, "energy": 7})
    assert health.sleep_energy(conn, TODAY, 7)["energy_gap"] is None
    save_checkin(conn, day(2), {"sleep_hours": 6.2, "energy": 5})
    save_checkin(conn, day(3), {"sleep_hours": 7.4, "energy": 8})
    assert health.sleep_energy(conn, TODAY, 7)["energy_gap"] == 3.0


def test_health_log_upsert_and_validation(conn):
    health.save_log(conn, TODAY, {"water_l": 1.5})
    health.save_log(conn, TODAY, {"caffeine_cups": 2})
    assert health.log_for(conn, TODAY)["water_l"] == 1.5
    with pytest.raises(ValueError):
        health.save_log(conn, TODAY, {"caffeine_last": "4pm"})
    with pytest.raises(ValueError):
        health.save_log(conn, TODAY, {"water_l": 40})


def test_api_export_and_backups(client, conn):
    assert client.put(f"/api/health-log/{TODAY}", json={"water_l": 2, "caffeine_last": "13:00"}).status_code == 200
    r = client.get(f"/api/health/{TODAY}?days=7")
    assert r.json()["inputs"]["water_l"] == 2.0 and len(r.json()["series"]) == 7
    assert client.get(f"/api/health/{TODAY}?days=5").status_code == 422
    assert "burnout" in export(conn, 7, TODAY)["health"]
    assert backups.export_all(conn)["tables"]["health_logs"][0]["caffeine_last"] == "13:00"
