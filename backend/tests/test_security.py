import pytest
from fastapi.testclient import TestClient

from samuel.api import create_app
from samuel.coach import command
from samuel.security import hostname


@pytest.fixture
def local():
    """A client whose requests are addressed to localhost, like a real browser tab."""
    return TestClient(create_app(), base_url="http://127.0.0.1:8765")


def test_hostname_parsing():
    assert hostname("127.0.0.1:8765") == "127.0.0.1"
    assert hostname("LOCALHOST") == "localhost"
    assert hostname("[::1]:8765") == "::1"
    assert hostname("evil.example:8765") == "evil.example"


def test_local_requests_work(local):
    r = local.get("/api/status")
    assert r.status_code == 200
    assert r.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["referrer-policy"] == "no-referrer"


def test_dns_rebinding_is_refused():
    # The page's own domain now resolves to 127.0.0.1, so its requests carry that Host.
    rebound = TestClient(create_app(), base_url="http://attacker.example:8765")
    r = rebound.get("/api/days/2026-10-20")
    assert r.status_code == 421
    assert "checkin" not in r.text


def test_cross_site_writes_are_refused(local):
    body = {"energy": 5}
    assert local.put("/api/checkins/2026-10-20", json=body, headers={"Origin": "https://evil.example"}).status_code == 403
    assert local.put("/api/checkins/2026-10-20", json=body, headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    assert local.post("/api/coach/run", json={}, headers={"Origin": "http://evil.example"}).status_code == 403
    # Same site is fine.
    assert local.put("/api/checkins/2026-10-20", json=body, headers={"Origin": "http://127.0.0.1:8765"}).status_code == 200
    assert local.put("/api/checkins/2026-10-20", json=body, headers={"Origin": "http://localhost:5173"}).status_code == 200


def test_writes_must_be_json(local):
    # A plain HTML form can post text/plain cross-site without a preflight.
    r = local.post("/api/coach/run", content='{"skill": "daily-report"}', headers={"Content-Type": "text/plain"})
    assert r.status_code == 415


def test_no_cdn_api_docs(local):
    # Swagger docs would load scripts from a CDN.
    for path in ("/api/docs", "/api/openapi.json", "/docs", "/openapi.json"):
        assert "swagger" not in local.get(path).text.lower()
    assert local.get("/api/docs").status_code == 404


def test_coach_may_only_read_and_save_reports():
    cmd = command("daily-report")
    allowed = cmd[cmd.index("--allowedTools") + 1:]
    assert allowed == ["Bash(samuel export *)", "Bash(samuel report add *)"]
