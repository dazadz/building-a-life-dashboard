-- Subtasks can have their own due date.

ALTER TABLE subtasks ADD COLUMN due_date TEXT;  -- YYYY-MM-DD
