-- One list of types for routine blocks and tasks: focus, fixed, work, spiritual, habit, recovery,
-- leisure. Widening the routines CHECK means rebuilding the table, which routine_logs and tasks
-- point to, so foreign keys are off while it's rebuilt and checked afterwards.
-- needs: foreign_keys off

CREATE TABLE routines_new (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    start         TEXT NOT NULL,
    end           TEXT NOT NULL,
    weekdays      TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]',
    note          TEXT,
    kind          TEXT NOT NULL DEFAULT 'focus'
                  CHECK (kind IN ('focus', 'fixed', 'work', 'spiritual', 'habit', 'recovery', 'leisure')),
    goal_id       INTEGER REFERENCES goals (id) ON DELETE SET NULL,
    habit_key     TEXT,
    steps         TEXT NOT NULL DEFAULT '[]',
    remind_before INTEGER NOT NULL DEFAULT 1,
    remind_start  INTEGER NOT NULL DEFAULT 1,
    day_type_id   INTEGER REFERENCES day_types (id) ON DELETE SET NULL
);
INSERT INTO routines_new (id, name, start, end, weekdays, note, kind, goal_id, habit_key, steps, remind_before, remind_start, day_type_id)
    SELECT id, name, start, end, weekdays, note, kind, goal_id, habit_key, steps, remind_before, remind_start, day_type_id FROM routines;
DROP TABLE routines;
ALTER TABLE routines_new RENAME TO routines;

-- Tasks get the same type; it replaces the free-form list in the app (the list column stays, unused).
ALTER TABLE tasks ADD COLUMN type TEXT
    CHECK (type IS NULL OR type IN ('focus', 'fixed', 'work', 'spiritual', 'habit', 'recovery', 'leisure'));
UPDATE tasks SET type = 'work' WHERE lower(list) = 'work';
