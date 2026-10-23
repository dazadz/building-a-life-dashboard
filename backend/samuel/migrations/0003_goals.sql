-- Goals, grouped by life area, each with milestones. Progress is the share of milestones done.

CREATE TABLE goals (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    area        TEXT NOT NULL,
    impact      INTEGER NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
    effort      INTEGER NOT NULL DEFAULT 3 CHECK (effort BETWEEN 1 AND 5),
    target_date TEXT,              -- YYYY-MM-DD
    done_date   TEXT,              -- YYYY-MM-DD, set when the goal is completed
    created_at  TEXT NOT NULL      -- YYYY-MM-DD
);

CREATE TABLE milestones (
    id        INTEGER PRIMARY KEY,
    goal_id   INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    title     TEXT NOT NULL,
    due_date  TEXT,                -- YYYY-MM-DD
    done_date TEXT                 -- YYYY-MM-DD
);

CREATE INDEX milestones_goal ON milestones (goal_id);
