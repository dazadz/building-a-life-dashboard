-- v0.5 routines: day types (e.g. office day and home day) with one-day overrides, richer blocks
-- (kind, linked goal or habit, steps, reminders), a log of done and skipped blocks, and tasks
-- queued for a block.

CREATE TABLE day_types (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    weekdays TEXT NOT NULL DEFAULT '[]',  -- JSON: the days it applies to unless overridden, 0 = Monday
    position INTEGER NOT NULL DEFAULT 0
);

-- "Today is a home day": a one-off change of a date's day type.
CREATE TABLE day_overrides (
    date        TEXT PRIMARY KEY,         -- YYYY-MM-DD
    day_type_id INTEGER NOT NULL REFERENCES day_types (id) ON DELETE CASCADE
);

-- A block with a day type runs on the days of that type; one without runs on its own weekdays.
ALTER TABLE routines ADD COLUMN kind TEXT NOT NULL DEFAULT 'focus'
    CHECK (kind IN ('focus', 'fixed', 'habit', 'recovery', 'leisure'));
ALTER TABLE routines ADD COLUMN goal_id INTEGER REFERENCES goals (id) ON DELETE SET NULL;
ALTER TABLE routines ADD COLUMN habit_key TEXT;
ALTER TABLE routines ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';     -- JSON list, shown when the block starts
ALTER TABLE routines ADD COLUMN remind_before INTEGER NOT NULL DEFAULT 1;  -- 5 minutes before
ALTER TABLE routines ADD COLUMN remind_start INTEGER NOT NULL DEFAULT 1;
ALTER TABLE routines ADD COLUMN day_type_id INTEGER REFERENCES day_types (id) ON DELETE SET NULL;

CREATE TABLE routine_logs (
    routine_id    INTEGER NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
    date          TEXT NOT NULL,          -- the day the block started on
    status        TEXT CHECK (status IN ('done', 'skipped')),
    reason        TEXT,                   -- what got in the way, for a skipped block
    snoozed_until TEXT,                   -- HH:MM, a start reminder shows again then
    heads_up_at   TEXT,                   -- when each reminder was shown, so it shows once
    started_at    TEXT,
    PRIMARY KEY (routine_id, date)
);

-- A task can be queued for a block; the Now card shows it while the block runs.
ALTER TABLE tasks ADD COLUMN routine_id INTEGER REFERENCES routines (id) ON DELETE SET NULL;
