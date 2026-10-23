import socket

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


def test_app_starts_the_server_opens_a_window_and_stops_when_it_closes(monkeypatch):
    port = free_port()
    opened = []

    class Window:
        def __init__(self, cmd):
            opened.append(cmd)
            assert appwindow.is_running(port)  # the server answers before the window opens

        def wait(self):
            return 0

    monkeypatch.setattr(appwindow, "find_browser", lambda: "edge.exe")
    monkeypatch.setattr(appwindow.subprocess, "Popen", Window)
    cli.main(["app", "--port", str(port)])
    assert opened and opened[0][1] == f"--app=http://127.0.0.1:{port}"
    assert not appwindow.is_running(port)


def test_app_reuses_a_running_server(monkeypatch):
    monkeypatch.setattr(appwindow, "is_running", lambda port: True)
    monkeypatch.setattr(appwindow, "start_server", lambda port: (_ for _ in ()).throw(AssertionError("started")))
    monkeypatch.setattr(appwindow, "find_browser", lambda: "edge.exe")
    opened = []
    monkeypatch.setattr(appwindow.subprocess, "Popen", lambda cmd: opened.append(cmd))
    cli.main(["app"])
    assert opened
