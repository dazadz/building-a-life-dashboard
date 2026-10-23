import pytest
from fastapi.testclient import TestClient

from samuel import energy, health
from samuel.api import create_app


def test_slots_follow_local_time():
    assert [energy.slot_at(t) for t in ("06:30", "10:59", "11:00", "13:59", "14:00", "17:59", "18:00", "23:30")] == [
        "morning", "morning", "midday", "midday", "afternoon", "afternoon", "evening", "evening"]


def test_a_new_tap_replaces_the_old_one_and_null_clears(conn):
    energy.save_tap(conn, "2026-10-24", "morning", 6, "08:10")
    energy.save_tap(conn, "2026-10-24", "morning", 8, "09:40")
    assert energy.taps_for(conn, "2026-10-24") == {"morning": 8, "midday": None, "afternoon": None, "evening": None}
    energy.save_tap(conn, "2026-10-24", "morning", None, "09:41")
    assert energy.taps_for(conn, "2026-10-24")["morning"] is None


@pytest.mark.parametrize("slot,value,at", [("night", 5, "08:00"), ("morning", 11, "08:00"), ("morning", 0, "08:00"),
                                           ("morning", True, "08:00"), ("morning", 5, "8am")])
def test_taps_are_checked(conn, slot, value, at):
    with pytest.raises(ValueError):
        energy.save_tap(conn, "2026-10-24", slot, value, at)


def test_curve_needs_three_days_per_slot_and_finds_peak_and_dip(conn):
    for d, (m, a) in zip(("2026-10-20", "2026-10-21", "2026-10-22"), ((8, 4), (7, 5), (9, 3))):
        energy.save_tap(conn, d, "morning", m, "08:00")
        energy.save_tap(conn, d, "afternoon", a, "15:00")
    energy.save_tap(conn, "2026-10-22", "evening", 6, "20:00")  # only one day: not shown yet
    c = energy.curve(conn, "2026-10-24", 7)
    assert [p["average"] for p in c["points"]] == [8.0, None, 4.0, None]
    assert c["points"][3]["days"] == 1
    assert (c["peak"], c["dip"]) == ("morning", "afternoon")
    # Outside the period, taps don't count.
    assert energy.curve(conn, "2026-10-30", 7)["points"][0]["average"] is None


def test_one_slot_has_no_peak_or_dip(conn):
    for d in ("2026-10-20", "2026-10-21", "2026-10-22"):
        energy.save_tap(conn, d, "morning", 7, "08:00")
    assert energy.curve(conn, "2026-10-22", 7)["peak"] is None


def test_energy_api_and_the_health_screen(conn):
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765")
    r = client.put("/api/energy/2026-10-24/midday", json={"value": 4, "at": "12:30"})
    assert r.json()["midday"] == 4
    assert client.get("/api/energy/2026-10-24").json()["midday"] == 4
    assert client.put("/api/energy/2026-10-24/midday", json={"value": 12, "at": "12:30"}).status_code == 422
    assert client.put("/api/energy/2026-10-24/dusk", json={"value": 4, "at": "12:30"}).status_code == 422
    h = client.get("/api/health/2026-10-24?days=7").json()
    assert h["taps_today"]["midday"] == 4 and h["energy_curve"]["min_days"] == 3
    assert "energy_curve_30d" in health.for_coach(conn, "2026-10-24")
