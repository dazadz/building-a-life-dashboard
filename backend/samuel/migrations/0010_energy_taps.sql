-- Energy taps: optional 1-10 ratings during the day, one per slot, for the energy curve.

CREATE TABLE energy_taps (
    date  TEXT NOT NULL,   -- YYYY-MM-DD
    slot  TEXT NOT NULL CHECK (slot IN ('morning', 'midday', 'afternoon', 'evening')),
    value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 10),
    at    TEXT NOT NULL,   -- local HH:MM when tapped
    PRIMARY KEY (date, slot)
);
