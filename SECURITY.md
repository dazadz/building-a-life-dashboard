# Security

Samuel holds personal data: check-ins, mood, sleep, health notes and goals. It is built so that data stays on the owner's computer.

## How Samuel protects your data

- **Local only.** The server binds to `127.0.0.1`, and it refuses requests that aren't addressed to `localhost` or `127.0.0.1`, which blocks DNS rebinding. It refuses changes sent from other websites, or that aren't JSON.
- **Browser headers.** A strict Content Security Policy, no framing, `nosniff`, and no referrer.
- **Data outside the repo.** The database lives in `~/.samuel/` (or `SAMUEL_DATA_DIR`), never in the project folder.
- **No outside requests.** No analytics, no CDNs, and fonts are bundled.
- **The coach.** Reports are written by Claude Code under your own account. The only data that leaves your computer is what it sends to Anthropic when you ask for a report. It may only run `samuel export` and `samuel report add`, and check-in text is passed to it as data, not instructions.
- **Commits.** A pre-commit hook and a CI check reject database files, secrets, local paths and personal email addresses.

Phone access (planned) will need a passcode, and will run over a private Tailscale HTTPS link, never the open internet.

## Reporting a problem

Please report security problems privately through GitHub's **Report a vulnerability** button on the Security tab, not in a public issue. Include what you found and how to reproduce it. This is a personal, noncommercial project, so responses are best effort.
