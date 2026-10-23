import pytest

from samuel import db


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    """Every test gets its own empty data folder, never ~/.samuel."""
    monkeypatch.setenv("SAMUEL_DATA_DIR", str(tmp_path))
    return tmp_path


@pytest.fixture
def conn():
    c = db.connect()
    yield c
    c.close()
