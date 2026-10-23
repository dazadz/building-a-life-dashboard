-- Core loop: settings, daily check-ins, habits, coach reports and coach jobs.

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL  -- JSON
);

INSERT INTO settings (key, value) VALUES
    ('sleep_target_hours', '7.5'),
    ('deep_work_target_hours', '3'),
    ('wake_target', '"07:00"');

-- The 12 daily questions. A NULL answer means "not answered", never zero.
CREATE TABLE checkins (
    date            TEXT PRIMARY KEY,  -- YYYY-MM-DD
    wake_time       TEXT,              -- HH:MM
    sleep_hours     REAL CHECK (sleep_hours BETWEEN 0 AND 24),
    mood            TEXT CHECK (mood IN ('low', 'flat', 'okay', 'good', 'great')),
    energy          INTEGER CHECK (energy BETWEEN 1 AND 10),
    main_goal       TEXT,
    workout         TEXT CHECK (workout IN ('yes', 'no', 'rest')),
    deep_work_hours REAL CHECK (deep_work_hours BETWEEN 0 AND 24),
    productivity    INTEGER CHECK (productivity BETWEEN 1 AND 10),
    distraction     TEXT,
    wins            TEXT,
    failures        TEXT,
    improvement     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE habits (
    id       INTEGER PRIMARY KEY,
    key      TEXT NOT NULL UNIQUE,
    name     TEXT NOT NULL,
    auto     INTEGER NOT NULL DEFAULT 0,  -- 1 = ticked from the check-in
    position INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0
);

INSERT INTO habits (key, name, auto, position) VALUES
    ('wake_on_time',     'Wake up on time',           1, 1),
    ('deep_work',        'Deep work completed',       1, 2),
    ('workout',          'Workout done',              1, 3),
    ('reading',          'Reading done',              0, 4),
    ('healthy_eating',   'Healthy eating',            0, 5),
    ('water',            'Water target',              0, 6),
    ('meditation',       'Meditation',                0, 7),
    ('no_procrastination', 'No procrastination',      0, 8),
    ('no_social_media',  'No excessive social media', 0, 9),
    ('sleep_target',     'Sleep target achieved',     1, 10);

CREATE TABLE habit_logs (
    habit_id INTEGER NOT NULL REFERENCES habits (id),
    date     TEXT NOT NULL,
    status   TEXT NOT NULL CHECK (status IN ('done', 'missed', 'skipped')),
    source   TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
    PRIMARY KEY (habit_id, date)
);

CREATE TABLE reports (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly', 'onboarding', 'ask')),
    date       TEXT NOT NULL,      -- the day or period start the report is about
    markdown   TEXT NOT NULL,
    data       TEXT,               -- JSON the coach used, optional
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX reports_kind_date ON reports (kind, date);

CREATE TABLE coach_jobs (
    id          INTEGER PRIMARY KEY,
    skill       TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
    error       TEXT,
    report_id   INTEGER REFERENCES reports (id),
    started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    finished_at TEXT
);
