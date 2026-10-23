-- Tasks with reminders and subtasks. Times are the user's local time.

CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    notes       TEXT,
    list        TEXT NOT NULL DEFAULT 'Personal',
    priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
    due_date    TEXT,               -- YYYY-MM-DD
    due_time    TEXT,               -- HH:MM
    remind_at   TEXT,               -- YYYY-MM-DDTHH:MM
    notified_at TEXT,               -- when the reminder was shown
    goal_id     INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    done_at     TEXT,               -- YYYY-MM-DDTHH:MM
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE subtasks (
    id      INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title   TEXT NOT NULL,
    done    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX tasks_due ON tasks (done_at, due_date);
CREATE INDEX subtasks_task ON subtasks (task_id);
