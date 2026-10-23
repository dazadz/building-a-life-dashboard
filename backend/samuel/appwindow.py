"""`samuel app`: Samuel in its own window, with no browser tabs, address bar or toolbar.

It uses a Chromium browser's app mode (Edge first, as every Windows PC has it) with a separate
browser profile in the data folder. Edge doesn't reliably keep its launcher process alive for as
long as the window is open, so a server started by `samuel app` watches for the page instead: the
app checks in every 30 seconds, and the server stops once it hasn't heard from any page for
IDLE_STOP seconds.
"""

import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

from . import db

BROWSER_NAMES = ("msedge", "chrome", "chromium", "google-chrome", "chromium-browser")
IDLE_STOP = 180  # seconds without any request before a server started by `samuel app` stops
CHECK_EVERY = 5


def is_running(port: int) -> bool:
    """True when Samuel (not some other program) answers on this port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=1) as r:
            return "onboarded" in json.load(r)
    except (OSError, ValueError):
        return False


def find_browser() -> str | None:
    """A Chromium browser that supports app windows: Edge first, then Chrome or Chromium."""
    places = []
    for env in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        base = os.environ.get(env)
        if base:
            places += [Path(base) / "Microsoft/Edge/Application/msedge.exe",
                       Path(base) / "Google/Chrome/Application/chrome.exe"]
    places += [Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
               Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
    found = [str(p) for p in places if p.is_file()]
    found += [p for p in (shutil.which(n) for n in BROWSER_NAMES) if p]
    return found[0] if found else None


def window_command(browser: str, port: int) -> list[str]:
    profile = db.data_dir() / "app-window"
    return [
        browser, f"--app=http://127.0.0.1:{port}", f"--user-data-dir={profile}",
        "--no-first-run", "--no-default-browser-check", "--window-size=1440,900",
    ]


def start_server(port: int):
    """Run the server on a background thread and wait until it answers."""
    import uvicorn

    from .api import create_app
    from .cli import start_background_tasks

    start_background_tasks()
    server = uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=port, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if is_running(port):
            return server, thread
        if not thread.is_alive():
            break
        time.sleep(0.1)
    raise RuntimeError(f"Samuel's server didn't start on port {port}. Is another program using it?")


def run(port: int) -> None:
    started = None
    if not is_running(port):
        print(f"Starting Samuel at http://127.0.0.1:{port}  (data: {db.data_dir()})")
        started = start_server(port)

    browser = find_browser()
    if browser is None:
        print("No Edge or Chrome found, so Samuel opens in your default browser instead.")
        webbrowser.open(f"http://127.0.0.1:{port}")
    else:
        subprocess.Popen(window_command(browser, port))
    if started:
        print("Samuel stops a few minutes after its window closes. Press Ctrl+C to stop it now.")
        _serve_while_open(*started)


def _serve_while_open(server, thread) -> None:
    """Keep the server up while a page keeps checking in, then stop it."""
    state = server.config.app.state
    try:
        while thread.is_alive() and time.monotonic() - state.last_request < IDLE_STOP:
            time.sleep(CHECK_EVERY)
    except KeyboardInterrupt:
        pass
    server.should_exit = True
    thread.join(timeout=10)


def quiet_output_to_log() -> None:
    """Started without a console (pythonw, the desktop shortcut): write messages to a log file."""
    if sys.stdout is None or sys.stderr is None:
        log = open(db.data_dir() / "app.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stdout or log
        sys.stderr = sys.stderr or log


def create_shortcut(port: int) -> Path:
    """A Windows desktop shortcut that opens Samuel without a console window."""
    if os.name != "nt":
        raise RuntimeError("Desktop shortcuts are only made on Windows for now. Run `samuel app` instead.")
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    if not pythonw.is_file():
        raise RuntimeError(f"Couldn't find pythonw.exe next to {sys.executable}.")
    args = "-m samuel app" + (f" --port {port}" if port != 8765 else "")
    icon = str(Path(__file__).with_name("assets") / "samuel.ico")
    # Values go to PowerShell as environment variables, never pasted into the script text.
    script = (
        "$desktop = [Environment]::GetFolderPath('Desktop');"
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Samuel.lnk'));"
        "$s.TargetPath = $env:SAMUEL_LNK_TARGET; $s.Arguments = $env:SAMUEL_LNK_ARGS;"
        "$s.WorkingDirectory = $env:USERPROFILE; $s.IconLocation = $env:SAMUEL_LNK_ICON;"
        "$s.Description = 'Samuel, your local performance coach'; $s.Save();"
        "Write-Output (Join-Path $desktop 'Samuel.lnk')"
    )
    env = {**os.environ, "SAMUEL_LNK_TARGET": str(pythonw), "SAMUEL_LNK_ARGS": args, "SAMUEL_LNK_ICON": icon}
    out = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        env=env, capture_output=True, text=True, check=True,
    )
    return Path(out.stdout.strip())
