# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Samuel**: a local personal performance dashboard with Claude Code as its AI coach, built from the "LIFE OS PRIME" prompt. The build plan, architecture and milestones are in `docs/PLAN.md`; follow it. The stack is React + TypeScript + Vite, FastAPI and SQLite. It is in the design stage and no app is scaffolded yet. Add build, run and test commands here once it is.

Privacy is a hard requirement. This repo is public and the author uses the app daily, so personal data must never enter the repo: the database lives in `~/.samuel/` (outside the repo), and screenshots, tests and fixtures use only fake demo data.

## Git workflow

As you work, commit to Git and push to GitHub regularly, so there is always a saved version to revert to.

- Commit after each logical change; don't batch unrelated work into one commit.
- Write clean commit messages: an imperative subject of 72 characters or fewer (e.g. "Add task snooze buttons"), then a short body explaining why when it isn't obvious.
- Push to `origin main` after committing.
- Never commit secrets, `.env` files or local database files (`.gitignore` covers these).
- Undo published work with `git revert`, not by rewriting pushed history.

## Design

`design/*.dc.html` and `design/canvas.json` are the source of the design canvas at https://claude.ai/artifact/1DUdad1m3RYN15j932Dagj (Onboarding, Home with Needs a reply, Check-in, Habits, Health & energy, Goals, Weekly and Monthly reviews, Coach, Tasks, Ctrl+K palette, Settings → Appearance). Keep the files and the canvas in sync when designs change, and build the app to match them.

Design rules:
- Dark but bright: lifted blue-violet surfaces (page #10121A, sidebar #151823, card #1B1E2B, border #2C3145) and one vivid aqua accent (default #3DDCD0). Status colours: green #8BE77A, amber #FFC766, blue #6CCBFF.
- Users can re-theme from any accent (see Custom themes in `docs/PLAN.md`), so build every colour from CSS variables and never hard-code the hex values in components.
- Every card prompts an action and ends with a "→" link.
- Dense lists of 5–10 rows with "Show more", filter pills, sortable headers, and visible labels.
- No hero KPI cards, emoji, gradients, glass effects, nested cards, or pure black/white.
