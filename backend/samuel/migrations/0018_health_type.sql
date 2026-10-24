-- Health joins the types for routine blocks and tasks. The routines and tasks CHECKs change, so both
-- tables are rebuilt; subtasks, routine_logs and tasks point at them, so foreign keys are off while
-- they're rebuilt and checked afterwards.
-- needs: foreign_keys off

CREATE TABLE routines_new (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    start         TEXT NOT NULL,
    end           TEXT NOT NULL,
    weekdays      TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    note          TEXT,
    kind          TEXT NOT NULL DEFAULT 'focus'
                  CHECK (kind IN ('focus', 'fixed', 'work', 'faith', 'health', 'habit', 'recovery', 'leisure')),
    goal_id       INTEGER REFERENCES goals (id) ON DELETE SET NULL,
    habit_key     TEXT,
    steps         TEXT NOT NULL DEFAULT '[]',
    remind_before INTEGER NOT NULL DEFAULT 1,
    remind_start  INTEGER NOT NULL DEFAULT 1,
    day_type_id   INTEGER REFERENCES day_types (id) ON DELETE SET NULL
);
INSERT INTO routines_new (id, name, start, end, weekdays, note, kind, goal_id, habit_key, steps, remind_before, remind_start, day_type_id)
    SELECT id, name, start, end, weekdays, note, kind,
           goal_id, habit_key, steps, remind_before, remind_start, day_type_id FROM routines;
DROP TABLE routines;
ALTER TABLE routines_new RENAME TO routines;

CREATE TABLE tasks_new (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    notes       TEXT,
    list        TEXT NOT NULL DEFAULT 'Personal',
    priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
    due_date    TEXT,
    due_time    TEXT,
    remind_at   TEXT,
    notified_at TEXT,
    goal_id     INTEGER REFERENCES goals (id) ON DELETE SET NULL,
    done_at     TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    routine_id  INTEGER REFERENCES routines (id) ON DELETE SET NULL,
    type        TEXT CHECK (type IS NULL OR type IN ('focus', 'fixed', 'work', 'faith', 'health', 'habit', 'recovery', 'leisure'))
);
INSERT INTO tasks_new (id, title, notes, list, priority, due_date, due_time, remind_at, notified_at, goal_id, done_at, created_at, routine_id, type)
    SELECT id, title, notes, list, priority, due_date, due_time, remind_at, notified_at, goal_id, done_at, created_at, routine_id,
           type FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_due ON tasks (done_at, due_date);
