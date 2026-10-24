# 4. Samuel suggests, you decide

Date: 2026-10-24 · Status: accepted

## Context

In v0.5 Samuel plans with the user: it proposes goals, milestones, habits, tasks, routine blocks and the user's pains. Until now coach runs could only read data (`samuel export`) and save a report (`samuel report add`). Check-in text, notes and profile answers reach Claude, so anything that lets a coach run change data can be steered by that text (prompt injection).

## Decision

Coach runs get one more command, `samuel suggest add`, which only adds **suggestions**:
- Suggestions sit in their own table and change nothing else. The user accepts, edits or dismisses each one in the app.
- Each suggestion is validated when it arrives and again when it is accepted, with the same rules as the user's own edits.
- Goals are linked by title, never by id, and a coach run can't set a task's goal id directly.
- Input comes on stdin only: at most 25 suggestions per run, with capped text lengths. One invalid item rejects the whole batch.
- Dismissed ideas are listed in the export, so Samuel doesn't suggest them again.

## Consequences

- The worst a steered coach run can do is fill the inbox with odd suggestions. The user sees each one as plain text before anything changes.
- Accepting a plan takes a few clicks; that's the price of keeping the user in control.
- `--allowedTools` is now `samuel export`, `samuel report add` and `samuel suggest add`. The security test pins this list.
- The plan builder reads sensitive answers (`--sensitive`) so the plan can respect health limits. Its rules say never to quote them.
