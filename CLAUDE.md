# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal productivity dashboard (daily brief, tasks, replies, habits, working set, weekly review) replacing a Notion dashboard. It is in the design stage: no stack has been chosen and no app is scaffolded yet. Add build, run and test commands here once it is.

## Git workflow

As you work, commit to Git and push to GitHub regularly, so there is always a saved version to revert to.

- Commit after each logical change; don't batch unrelated work into one commit.
- Write clean commit messages: an imperative subject of 72 characters or fewer (e.g. "Add task snooze buttons"), then a short body explaining why when it isn't obvious.
- Push to `origin main` after committing.
- Never commit secrets, `.env` files or local database files (`.gitignore` covers these).
- Undo published work with `git revert`, not by rewriting pushed history.

## Design

`design/*.dc.html` and `design/canvas.json` are the source of the design canvas at https://claude.ai/artifact/1DUdad1m3RYN15j932Dagj (Home, Tasks, Weekly review, Ctrl+K palette). Keep the files and the canvas in sync when designs change, and build the app to match them.

Design rules:
- Dark theme with a single accent colour.
- Every card prompts an action and ends with a "→" link.
- Dense lists of 5–10 rows with "Show more", filter pills, sortable headers, and visible labels.
- No hero KPI cards, emoji, gradients, glass effects, nested cards, or pure black/white.
