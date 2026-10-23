from datetime import date, timedelta

from fastapi.testclient import TestClient

from samuel import health, links, reports, settings
from samuel.api import create_app
from samuel.checkins import save_checkin


def day(n: int) -> str:
    return (date(2026, 10, 24) - timedelta(days=n)).isoformat()


def test_sleep_to_target_lifts_same_day_energy(conn):
    settings.update(conn, {"sleep_target_hours": 7.5}, "2026-09-01")
    for n in range(8):
        good = n % 2 == 0
        save_checkin(conn, day(n), {"sleep_hours": 8 if good else 6, "energy": 8 if good else 5})
    found = {(x["condition"], x["outcome"], x["when"]): x for x in links.links(conn, day(0), 30)["links"]}
    energy = found[("sleep_target", "energy", "same day")]
    assert (energy["with_avg"], energy["without_avg"], energy["difference"]) == (8.0, 5.0, 3.0)
    assert (energy["with_days"], energy["without_days"]) == (4, 4)


def test_late_caffeine_compares_with_the_next_nights_sleep(conn):
    for n in range(1, 9):
        late = n % 2 == 0
        health.save_log(conn, day(n), {"caffeine_cups": 2, "caffeine_last": "16:30" if late else "11:00"})
        save_checkin(conn, day(n - 1), {"sleep_hours": 6.0 if late else 7.2})
    x = next(l for l in links.links(conn, day(0), 30)["links"] if l["condition"] == "late_caffeine" and l["outcome"] == "sleep")
    assert (x["when"], x["with_avg"], x["without_avg"], x["difference"]) == ("next day", 6.0, 7.2, -1.2)


def test_small_or_thin_differences_stay_hidden(conn):
    # Under the 0.8-point threshold.
    for n in range(8):
        save_checkin(conn, day(n), {"sleep_hours": 8 if n % 2 else 6, "energy": 6 if n % 2 else 5.5})
    assert not [x for x in links.links(conn, day(0), 30)["links"] if x["outcome"] == "energy"]
    # Only 2 days on one side.
    conn.execute("DELETE FROM checkins")
    for n, s in enumerate([8, 8, 6, 6, 6, 6]):
        save_checkin(conn, day(n), {"sleep_hours": s, "energy": 9 if s == 8 else 3})
    assert links.links(conn, day(0), 30)["links"] == []


def test_links_api_and_coach_export(conn):
    client = TestClient(create_app(), base_url="http://127.0.0.1:8765")
    assert client.get(f"/api/links/{day(0)}?days=90").json()["links"] == []
    assert client.get(f"/api/links/{day(0)}?days=7").status_code == 422
    assert reports.export(conn, 7, day(0))["links_90d"]["min_days"] == 3
