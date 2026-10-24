-- v0.5 "Your plan": the user's pains and goals, Samuel's suggestions waiting for approval, and the
-- `plan` report kind. Rebuilding `reports` needs foreign keys off, or chats would lose their links.
-- needs: foreign_keys off

CREATE TABLE pains_goals (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('pain', 'goal')),
    text       TEXT NOT NULL,
    area       TEXT,                 -- e.g. Career, Sleep, Energy
    evidence   TEXT,                 -- what in the user's answers or days shows it
    goal_id    INTEGER REFERENCES goals (id) ON DELETE SET NULL,
    habit_key  TEXT,                 -- the habit that tracks it, if any
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Ideas from Samuel. Nothing here changes the user's data until they accept it.
CREATE TABLE suggestions (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('pain', 'goal', 'milestone', 'habit', 'task', 'routine')),
    title      TEXT NOT NULL,        -- shown in the inbox; also how Samuel avoids repeating itself
    payload    TEXT NOT NULL,        -- JSON, validated when added and again when accepted
    reason     TEXT,                 -- Samuel's "why", citing the user's own answers
    batch      TEXT,                 -- groups one plan or one goal breakdown
    status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
    result_id  INTEGER,              -- the row accepting it created
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    decided_at TEXT
);

CREATE INDEX suggestions_status ON suggestions (status, id);

CREATE TABLE reports_new (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly', 'onboarding', 'ask', 'plan')),
    date       TEXT NOT NULL,
    markdown   TEXT NOT NULL,
    data       TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT INTO reports_new (id, kind, date, markdown, data, created_at)
    SELECT id, kind, date, markdown, data, created_at FROM reports;
DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;
CREATE INDEX reports_kind_date ON reports (kind, date);
