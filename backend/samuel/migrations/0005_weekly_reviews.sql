-- Weekly reviews: one per week, keyed by the week's Monday.

CREATE TABLE weekly_reviews (
    week_start TEXT PRIMARY KEY,            -- YYYY-MM-DD, a Monday
    questions  TEXT NOT NULL DEFAULT '[]',  -- JSON: [{key, question, answer}]
    priorities TEXT NOT NULL DEFAULT '[]',  -- JSON: up to 3 strings
    carry      TEXT NOT NULL DEFAULT '[]',  -- JSON: milestone ids carried into next week
    status     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'done')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
