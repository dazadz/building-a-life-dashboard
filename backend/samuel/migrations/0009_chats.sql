-- Chat with Samuel: conversations with follow-ups. Each user message starts a coach run that
-- reads the conversation so far and saves one reply.

CREATE TABLE chats (
    id         INTEGER PRIMARY KEY,
    title      TEXT NOT NULL,
    report_id  INTEGER REFERENCES reports (id) ON DELETE SET NULL,  -- the report it's about, if any
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE chat_messages (
    id         INTEGER PRIMARY KEY,
    chat_id    INTEGER NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'samuel')),
    text       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX chat_messages_by_chat ON chat_messages (chat_id, id);

ALTER TABLE coach_jobs ADD COLUMN chat_id INTEGER REFERENCES chats (id) ON DELETE CASCADE;
