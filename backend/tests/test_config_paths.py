from config import (
    DATA_DIR,
    DATABASE_PATH,
    DEFAULT_DATABASE_URL,
    PROJECT_ROOT,
    SEED_DATABASE_PATH,
    USER_SETTINGS_PATH,
    _resolve_relative_sqlite_url,
    settings,
)


def test_runtime_data_paths_are_absolute_and_share_one_directory():
    assert PROJECT_ROOT.is_absolute()
    assert DATA_DIR == PROJECT_ROOT / "backend" / "data"
    assert DATABASE_PATH == DATA_DIR / "lifelab.db"
    assert SEED_DATABASE_PATH == DATA_DIR / "seed.db"
    assert USER_SETTINGS_PATH == DATA_DIR / "user_settings.json"
    assert settings.database_url == DEFAULT_DATABASE_URL


def test_relative_database_url_does_not_depend_on_launch_directory(
    monkeypatch, tmp_path
):
    monkeypatch.chdir(tmp_path)

    resolved = _resolve_relative_sqlite_url(
        "sqlite+aiosqlite:///./backend/data/lifelab.db"
    )

    assert resolved == DEFAULT_DATABASE_URL
