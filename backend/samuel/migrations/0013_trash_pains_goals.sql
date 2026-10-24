-- Recently deleted can also hold pains and goals from About me. Nothing references the trash table,
-- so it can be rebuilt with foreign keys on.

CREATE TABLE trash_new (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('goal', 'milestone', 'task', 'routine', 'chat', 'pain_goal')),
    title      TEXT NOT NULL,
    data       TEXT NOT NULL,   -- JSON: {table: [rows]} as they were
    deleted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT INTO trash_new (id, kind, title, data, deleted_at) SELECT id, kind, title, data, deleted_at FROM trash;
DROP TABLE trash;
ALTER TABLE trash_new RENAME TO trash;
