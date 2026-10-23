-- The optional quick health log for Health & energy: what the check-in doesn't ask.

CREATE TABLE health_logs (
    date          TEXT PRIMARY KEY,   -- YYYY-MM-DD
    water_l       REAL CHECK (water_l BETWEEN 0 AND 10),
    caffeine_cups INTEGER CHECK (caffeine_cups BETWEEN 0 AND 20),
    caffeine_last TEXT,               -- HH:MM
    screens_late  INTEGER CHECK (screens_late BETWEEN 0 AND 600)  -- minutes after 22:00
);
