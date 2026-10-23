from pathlib import Path

from samuel import db


def test_default_data_dir_is_in_home(tmp_path, monkeypatch):
    monkeypatch.delenv("SAMUEL_DATA_DIR")
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    assert db.data_dir() == tmp_path / ".samuel"


def test_fresh_database_is_migrated(conn, data_dir):
    assert conn.execute("PRAGMA user_version").fetchone()[0] >= 1
    assert conn.execute("SELECT COUNT(*) FROM habits").fetchone()[0] == 10
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert not (data_dir / "backups").exists()  # nothing to back up on first run


def test_backup_before_migration(conn, data_dir, monkeypatch):
    real = db._migrations()
    monkeypatch.setattr(db, "_migrations", lambda: real + [(999, "CREATE TABLE extra (x);")])
    conn.close()
    conn = db.connect()
    backups = list((data_dir / "backups").glob("*before-v999.db"))
    assert len(backups) == 1
    assert conn.execute("PRAGMA user_version").fetchone()[0] == 999
    conn.close()
