# 2. Local-first SQLite, stored outside the repo

Date: 2026-10-24 · Status: accepted

## Context

Samuel holds sleep, mood, habits and free-text notes about someone's day. The repo is public, and its author uses the app every day from the same clone. One stray commit of the database would publish their personal data.

## Decision

- All data lives in one SQLite file on the user's computer, `~/.samuel/samuel.db`, in WAL mode. `SAMUEL_DATA_DIR` moves it.
- There is no shared server and no cloud sync. The server listens on 127.0.0.1 only.
- Schema changes are versioned migrations, with a backup taken before each one. A daily backup keeps the last 14 copies.
- `samuel export --all` and `samuel import` move everything as JSON. Export refuses to write inside a git repository.
- Guards in layers: `.gitignore` excludes `*.db`, the pre-commit hook (`scripts/privacy-check.sh`) blocks data files, secrets, local paths and personal emails, and CI runs the same check.
- Demos, tests, fixtures and screenshots use only the made-up persona Jordan, in a temp data dir.

## Consequences

- Personal data can't be committed by accident from the normal workflow.
- Each user owns their data and its backups. Losing the PC without a copy of `~/.samuel` loses the data.
- Reaching the app from a phone needs an opt-in private route (Tailscale is planned), not a public server.
