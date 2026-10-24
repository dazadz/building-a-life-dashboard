import socket
import threading
import time

from samuel import appwindow, cli


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
    # As read from a real Edge app window: browser ID, host and path, profile folder name.
    assert appwindow.window_app_id(r"C:\Edge\msedge.exe") == "MSEdge.127.0.0.1_/.app-window.Default"
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
    monkeypatch.setattr(appwindow, "start_server", lambda port: (_ for _ in ()).throw(AssertionError("started")))
    monkeypatch.setattr(appwindow, "find_browser", lambda: "edge.exe")
    opened = []
    monkeypatch.setattr(appwindow.subprocess, "Popen", lambda cmd: opened.append(cmd))
    cli.main(["app"])
    assert opened
