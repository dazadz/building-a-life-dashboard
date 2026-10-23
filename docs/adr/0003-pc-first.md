# 3. PC first, phone later

Date: 2026-10-24 · Status: accepted

## Context

The plan had the app usable on a phone from the start: 390px layouts, phone access over Tailscale HTTPS, a passcode, an installable PWA and push notifications. That is a lot of work and security surface before the core loop is proven.

## Decision

Build and ship the desktop app on the PC first. Phone layouts and phone access are their own later milestone (see Milestones in `docs/PLAN.md`).

## Consequences

- v0.1 runs only on the computer where Samuel is installed, on 127.0.0.1.
- No passcode, remote access or push code yet, so there is less to secure in the first releases.
- Screens are designed and tested at desktop width. They will need a phone-width pass later.
- The daily check-in happens at the PC until the phone milestone lands.
