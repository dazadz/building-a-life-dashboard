-- Routine blocks that make up "Today's plan": a name, a time window and the weekdays it runs on.

CREATE TABLE routines (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    start    TEXT NOT NULL,                       -- HH:MM
    end      TEXT NOT NULL,                       -- HH:MM
    weekdays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]', -- JSON, 0 = Monday
    note     TEXT
);
