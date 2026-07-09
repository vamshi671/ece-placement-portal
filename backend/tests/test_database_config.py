import importlib

import app.database as database


def test_postgres_url_is_normalized_for_psycopg(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@localhost:5432/appdb")
    reloaded = importlib.reload(database)

    assert reloaded.DATABASE_URL.startswith("postgresql+psycopg://")
    assert "postgres://" not in reloaded.DATABASE_URL
