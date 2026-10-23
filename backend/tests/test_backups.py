import json
from datetime import date

import pytest

from samuel import backups, cli, db, settings
from samuel.checkins import log_habit, save_checkin
from samuel.reports import add_report


def fill(conn):
    settings.update(conn, {"name": "Jordan", "onboarded": True}, "2026-10-20")
    settings.update(conn, {"sleep_target_hours": 8}, "2026-10-21")
    settings.set_habit_active(conn, "meditation", False)
    save_checkin(conn, "2026-10-20", {"sleep_hours": 7.2, "mood": "good", "wins": "Ran 6 km · fast"})
    log_habit(conn, "2026-10-20", "reading", "done")
    add_report(conn, "daily", "# Report · ok", "2026-10-20")


def test_export_then_import_round_trips(conn, tmp_path, monkeypatch):
    fill(conn)
    exported = backups.export_all(conn)

    monkeypatch.setenv("SAMUEL_DATA_DIR", str(tmp_path / "other"))
    fresh = db.connect()
    counts = backups.import_all(fresh, json.loads(json.dumps(exported)))
    assert counts["checkins"] == 1 and counts["reports"] == 1

    assert backups.export_all(fresh)["tables"] == exported["tables"]
    assert settings.targets_on(fresh, "2026-10-20")["sleep_target_hours"] == 7.5
    assert settings.targets_on(fresh, "2026-10-22")["sleep_target_hours"] == 8.0
    fresh.close()


def test_import_refuses_a_database_with_data(conn):
    fill(conn)
    with pytest.raises(ValueError, match="already has data"):
        backups.import_all(conn, backups.export_all(conn))


def test_import_checks_the_file(conn):
    with pytest.raises(ValueError, match="isn't a Samuel export"):
        backups.import_all(conn, {"format": "something-else"})

    data = backups.export_all(conn)
    data["schema_version"] = 1
    with pytest.raises(ValueError, match="database version"):
        backups.import_all(conn, data)

    # Column names come from the file, so anything unknown is refused before building SQL.
    data = backups.export_all(conn)
    data["tables"]["checkins"] = [{"date": "2026-10-20", "x) VALUES (1); DROP TABLE reports; --": 1}]
    with pytest.raises(ValueError, match="unexpected columns"):
        backups.import_all(conn, data)
    assert conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0] == 0


def test_daily_backup_once_a_day_and_keeps_14(conn, data_dir):
    assert backups.daily_backup(conn, date(2026, 10, 1)) is not None
    assert backups.daily_backup(conn, date(2026, 10, 1)) is None  # already done that day
    for d in range(2, 20):
        (data_dir / "backups" / f"samuel-202610{d:02d}-000000-daily.db").write_bytes(b"")
    backups.daily_backup(conn, date(2026, 10, 25))
    daily = sorted((data_dir / "backups").glob("*-daily.db"))
    assert len(daily) == 14
    assert daily[-1].name.startswith("samuel-20261025-")


def test_export_refuses_to_write_inside_a_git_repo(conn, tmp_path, capsys):
    repo = tmp_path / "repo"
    (repo / ".git").mkdir(parents=True)
    with pytest.raises(SystemExit):
        cli.main(["export", "--all", "--out", str(repo / "export.json")])
    assert not (repo / "export.json").exists()

    outside = tmp_path / "safe" / "export.json"
    outside.parent.mkdir()
    cli.main(["export", "--all", "--out", str(outside)])
    assert json.loads(outside.read_text(encoding="utf-8"))["format"] == "samuel-export"


def test_cli_import(conn, tmp_path, monkeypatch, capsys):
    fill(conn)
    f = tmp_path / "export.json"
    f.write_text(json.dumps(backups.export_all(conn)), encoding="utf-8")
    monkeypatch.setenv("SAMUEL_DATA_DIR", str(tmp_path / "new"))
    cli.main(["import", str(f)])
    assert "Imported" in capsys.readouterr().out
