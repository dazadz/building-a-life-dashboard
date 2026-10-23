# 1. Claude Code is the coach

Date: 2026-10-24 · Status: accepted

## Context

Samuel needs an AI coach that writes daily reports, weekly reviews and monthly analyses from the user's own data. The repo is public and anyone should be able to run their own copy. Calling the Claude API directly would mean every user manages an API key and pays per token, and the app would hold a secret.

## Decision

The coach is Claude Code, run on the user's own computer with their own login.

- The backend runs `claude -p "/<skill>"` as a background job, from the repo root.
- Each kind of report is a skill in `.claude/skills/` (`daily-report` so far). The skills hold the Samuel persona rules.
- Claude reads and writes only through the `samuel` CLI (`samuel export`, `samuel report add`). Its tools are limited to `Bash(samuel *)`.
- Scores are plain rules in the backend (`docs/scores.md`), so the app works without Claude Code and the numbers never depend on a model.
- Free text in the export is marked as the user's own words, to be treated as data, not instructions.

## Consequences

- No API keys in the app or the repo. Reports use the user's Claude Code subscription.
- Claude Code must be installed and logged in for reports. Without it the Coach page shows a needs-setup line and everything else works.
- Report data leaves the machine only when the user asks for a report, and goes to Anthropic under their own account.
- Report runs take tens of seconds, so they run in the background and the UI polls a job.
