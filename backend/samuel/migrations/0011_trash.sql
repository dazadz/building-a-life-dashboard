-- Recently deleted: a copy of each deleted goal, milestone, task, routine block or chat, so it can be
-- restored. Kept for 30 days on this computer, then removed for good.

CREATE TABLE trash (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('goal', 'milestone', 'task', 'routine', 'chat')),
    title      TEXT NOT NULL,
    data       TEXT NOT NULL,   -- JSON: {table: [rows]} as they were
    deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
