-- Onboarding: remember when setup is done, and keep the history of target changes so
-- past days keep the targets that applied then (see docs/scores.md).

CREATE TABLE target_history (
    key       TEXT NOT NULL,
    value     TEXT NOT NULL,  -- JSON
    from_date TEXT NOT NULL,  -- YYYY-MM-DD, first day the value applies
    PRIMARY KEY (key, from_date)
);

-- Anyone who already has a name set (such as the demo persona) has finished setup.
INSERT INTO settings (key, value)
SELECT 'onboarded', CASE WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'name') THEN 'true' ELSE 'false' END;
