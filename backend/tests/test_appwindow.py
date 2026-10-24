import socket
import threading
import time

import pytest

from samuel import appwindow, build, cli


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def test_nothing_running_on_a_free_port():
    assert appwindow.is_running(free_port()) is False


def test_window_command_uses_app_mode_and_its_own_profile(data_dir):
    cmd = appwindow.window_command("edge.exe", 8765)
    assert cmd[0] == "edge.exe"
    assert "--app=http://127.0.0.1:8765" in cmd
    assert f"--user-data-dir={data_dir / 'app-window'}" in cmd


def test_window_app_id_matches_the_browsers_taskbar_id():
    # As read from a real Edge app window: browser ID, host and path, profile folder name
    # without its hyphen.
    assert appwindow.window_app_id(r"C:\Edge\msedge.exe") == "MSEdge.127.0.0.1_/.appwindow.Default"
    assert appwindow.window_app_id("/usr/bin/google-chrome").startswith("Chrome.127.0.0.1_/.")


def test_app_serves_while_the_page_checks_in_then_stops(monkeypatch):
    port = free_port()
    opened = []

    def window(cmd):
        opened.append(cmd)
        assert appwindow.is_running(port)  # the server answers before the window opens

        def page():  # the open window checking in, then closing after a few check-ins
            for _ in range(4):
                time.sleep(0.2)
                appwindow.is_running(port)
        threading.Thread(target=page, daemon=True).start()

    monkeypatch.setattr(appwindow, "IDLE_STOP", 0.5)
    monkeypatch.setattr(appwindow, "CHECK_EVERY", 0.05)
    monkeypatch.setattr(appwindow, "find_browser", lambda: "edge.exe")
    monkeypatch.setattr(appwindow.subprocess, "Popen", window)
    started = time.monotonic()
    cli.main(["app", "--port", str(port)])
    assert opened and opened[0][1] == f"--app=http://127.0.0.1:{port}"
    assert time.monotonic() - started >= 0.8  # stayed up while the page checked in
    assert not appwindow.is_running(port)


def test_app_reuses_a_running_server(monkeypatch):
    monkeypatch.setattr(appwindow, "is_running", lambda port: True)
    monkeypatch.setattr(appwindow, "server_info", lambda port: {"build": build.build_id(), "pid": 1, "started_by": "app"})
    monkeypatch.setattr(appwindow.os, "kill", lambda *a: (_ for _ in ()).throw(AssertionError("killed")))
    monkeypatch.setattr(appwindow, "start_server", lambda port: (_ for _ in ()).throw(AssertionError("started")))
    monkeypatch.setattr(appwindow, "find_browser", lambda: "edge.exe")
    opened = []
    monkeypatch.setattr(appwindow.subprocess, "Popen", lambda cmd: opened.append(cmd))
    cli.main(["app"])
    assert opened


@pytest.fixture
def launcher(monkeypatch):
    """`samuel app` with a fake server, browser and process list."""
    state = {"running": True, "killed": [], "started": [], "opened": []}
    monkeypatch.setattr(appwindow, "is_running", lambda port: state["running"])
    monkeypatch.setattr(appwindow, "find_browser", lambda: "edge.exe")
    monkeypatch.setattr(appwindow.subprocess, "Popen", lambda cmd: state["opened"].append(cmd))
    monkeypatch.setattr(appwindow, "_serve_while_open", lambda *a: None)

    def kill(pid, sig):
        state["killed"].append(pid)
        state["running"] = False
    monkeypatch.setattr(appwindow.os, "kill", kill)

    def start(port):
        state["started"].append(port)
        state["running"] = True
        return None, None
    monkeypatch.setattr(appwindow, "start_server", start)
    return state


def test_app_replaces_a_server_it_started_before_an_update(monkeypatch, launcher):
    monkeypatch.setattr(appwindow, "server_info", lambda port: {"build": "older", "pid": 4242, "started_by": "app"})
    cli.main(["app", "--port", "8799"])
    assert launcher["killed"] == [4242]
    assert launcher["started"] == [8799] and launcher["opened"]


def test_app_leaves_a_server_from_samuel_serve_alone(monkeypatch, launcher, capsys):
    monkeypatch.setattr(appwindow, "server_info", lambda port: {"build": "older", "pid": 4242, "started_by": "serve"})
    cli.main(["app", "--port", "8799"])
    assert launcher["killed"] == [] and launcher["started"] == []
    assert "older Samuel is still running" in capsys.readouterr().out


def test_status_reports_the_server_build(conn):
    from fastapi.testclient import TestClient

    from samuel.api import create_app

    server = TestClient(create_app(allowed_hosts={"testserver"}, started_by="app")).get("/api/status").json()["server"]
    assert server["build"] == build.build_id() and server["started_by"] == "app" and isinstance(server["pid"], int)
