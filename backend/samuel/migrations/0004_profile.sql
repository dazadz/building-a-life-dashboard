-- The full onboarding: answers to the profile questions in samuel/profile.py, one row per answer.

CREATE TABLE profile_answers (
    section    TEXT NOT NULL,
    question   TEXT NOT NULL,
    value      TEXT NOT NULL,   -- JSON
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (section, question)
);
