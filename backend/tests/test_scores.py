from samuel.scores import daily_scores

TARGETS = {"sleep_target_hours": 7.5, "deep_work_target_hours": 3, "wake_target": "07:00"}
FULL = {
    "wake_time": "07:10", "sleep_hours": 7.5, "mood": "good", "energy": 7, "workout": "yes",
    "deep_work_hours": 3, "productivity": 8,
}


def test_full_day():
    s = daily_scores(FULL, {"no_procrastination": "done", "no_social_media": "missed"}, TARGETS)
    assert s["productivity"] == round(100 * (0.5 * 7 / 9 + 0.5 * 1))
    assert s["focus"] == 75
    assert s["energy"] == round(100 * (0.5 * 6 / 9 + 0.3 + 0.2 * 0.75))
    assert s["discipline"] == 50
    assert s["balance"] == round(100 * (1 + 1 + 1 + 0.75) / 4)
    assert s["day"] is not None
    assert s["stress"] == round(1 + 9 * (0.4 * 0.25 + 0.3 * (1 - 6 / 9) + 0), 1)


def test_missing_is_not_zero():
    # Only mood answered: Energy has 20% of its weight, under half, so no score.
    s = daily_scores({"mood": "great"}, {}, TARGETS)
    assert s["energy"] is None
    assert s["productivity"] is None
    assert s["discipline"] is None
    assert s["day"] is None


def test_missing_weight_is_shared_out():
    # Energy 10/10 and no sleep answer: the score uses energy and mood only, not sleep = 0.
    s = daily_scores({"energy": 10, "mood": "great"}, {}, TARGETS)
    assert s["energy"] == 100


def test_unlogged_habits_are_ignored():
    s = daily_scores(None, {"reading": "done", "water": "missed", "meditation": "skipped"}, TARGETS)
    assert s["discipline"] == 50


def test_wake_time_and_overwork_ramps():
    late = daily_scores({**FULL, "wake_time": "08:30", "deep_work_hours": 9.5}, {}, TARGETS)
    on_time = daily_scores(FULL, {}, TARGETS)
    assert late["balance"] < on_time["balance"]


def test_day_score_needs_two_parts():
    s = daily_scores({"productivity": 10}, {}, TARGETS)
    assert s["productivity"] == 100  # the rating is half the weight
    assert s["day"] is None


def test_lifestyle_is_sleep_workout_eating_and_water():
    s = daily_scores(FULL, {"healthy_eating": "done", "water": "missed"}, TARGETS)
    assert s["lifestyle"] == 75  # sleep 1, workout 1, eating 1, water 0
    rest_day = daily_scores({**FULL, "workout": "rest", "sleep_hours": 6}, {}, TARGETS)
    assert rest_day["lifestyle"] == round(100 * (6 / 7.5 + 1) / 2)  # habits not logged: their weight is shared out
    assert daily_scores({"sleep_hours": 7.5}, {}, TARGETS)["lifestyle"] is None  # a quarter of the weight
