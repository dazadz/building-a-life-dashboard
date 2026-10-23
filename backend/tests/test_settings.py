import pytest

from samuel import scores, settings
from samuel.checkins import habits_for, log_habit, save_checkin


def test_fresh_database_needs_onboarding(conn):
    assert settings.public(conn, "2026-10-24")["onboarded"] is False


def test_update_validates(conn):
    with pytest.raises(ValueError):
        settings.update(conn, {"sleep_target_hours": 30}, "2026-10-24")
    with pytest.raises(ValueError):
        settings.update(conn, {"wake_target": "7am"}, "2026-10-24")
    with pytest.raises(ValueError):
        settings.update(conn, {"name": "   "}, "2026-10-24")
    with pytest.raises(ValueError):
        settings.update(conn, {"favourite_colour": "cyan"}, "2026-10-24")


def test_changed_target_applies_from_that_day_only(conn):
    # 7 h of sleep against the default 7.5 h target.
    save_checkin(conn, "2026-10-20", {"sleep_hours": 7, "energy": 10, "mood": "great"})
    before = scores.scores_for(conn, "2026-10-20")["energy"]

    settings.update(conn, {"sleep_target_hours": 7}, "2026-10-22")
    save_checkin(conn, "2026-10-22", {"sleep_hours": 7, "energy": 10, "mood": "great"})

    assert scores.scores_for(conn, "2026-10-20")["energy"] == before  # past day unchanged
    assert scores.scores_for(conn, "2026-10-22")["energy"] == 100      # new target met
    assert settings.targets_on(conn, "2026-10-21")["sleep_target_hours"] == 7.5
    assert settings.targets_on(conn, "2026-10-22")["sleep_target_hours"] == 7.0
    assert {h["key"]: h["status"] for h in habits_for(conn, "2026-10-22")}["sleep_target"] == "done"


def test_changing_twice_keeps_the_original(conn):
    settings.update(conn, {"deep_work_target_hours": 2}, "2026-10-22")
    settings.update(conn, {"deep_work_target_hours": 4}, "2026-10-23")
    assert settings.targets_on(conn, "2026-10-01")["deep_work_target_hours"] == 3
    assert settings.targets_on(conn, "2026-10-22")["deep_work_target_hours"] == 2
    assert settings.targets_on(conn, "2026-10-30")["deep_work_target_hours"] == 4


def test_turned_off_habit_stops_counting(conn):
    log_habit(conn, "2026-10-20", "reading", "missed")
    log_habit(conn, "2026-10-20", "water", "done")
    assert scores.scores_for(conn, "2026-10-20")["discipline"] == 50
    settings.set_habit_active(conn, "reading", False)
    assert scores.scores_for(conn, "2026-10-20")["discipline"] == 100
    assert "reading" not in {h["key"] for h in habits_for(conn, "2026-10-20")}
    with pytest.raises(KeyError):
        settings.set_habit_active(conn, "nope", False)


def test_turned_off_habit_is_not_auto_ticked(conn):
    settings.set_habit_active(conn, "workout", False)
    save_checkin(conn, "2026-10-20", {"workout": "yes"})
    assert conn.execute(
        "SELECT COUNT(*) FROM habit_logs l JOIN habits h ON h.id = l.habit_id WHERE h.key = 'workout'"
    ).fetchone()[0] == 0


def test_text_size_defaults_to_medium_and_can_change(conn):
    assert settings.public(conn, "2026-10-24")["text_size"] == "medium"
    settings.update(conn, {"text_size": "large"}, "2026-10-24")
    assert settings.public(conn, "2026-10-24")["text_size"] == "large"
    with pytest.raises(ValueError):
        settings.update(conn, {"text_size": "huge"}, "2026-10-24")


def test_theme_is_optional_validated_and_resettable(conn):
    assert settings.public(conn, "2026-10-24")["theme"] is None
    settings.update(conn, {"theme": {"accent": "#FF9F43", "darkness": "dim", "tint": 0.5}}, "2026-10-24")
    assert settings.public(conn, "2026-10-24")["theme"] == {"accent": "#ff9f43", "darkness": "dim", "tint": 0.5}
    for bad in ({"accent": "orange", "darkness": "dim", "tint": 0.5}, {"accent": "#ff9f43", "darkness": "light", "tint": 0.5},
                {"accent": "#ff9f43", "darkness": "dim", "tint": 2}, {"accent": "#ff9f43"}):
        with pytest.raises(ValueError):
            settings.update(conn, {"theme": bad}, "2026-10-24")
    settings.update(conn, {"theme": {}}, "2026-10-24")
    assert settings.public(conn, "2026-10-24")["theme"] is None
