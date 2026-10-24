#!/bin/sh
# Rejects personal data before it leaves this computer. Used by the pre-commit hook (staged files)
# and by CI (all tracked files).
#
#   scripts/privacy-check.sh --staged   check what is about to be committed
#   scripts/privacy-check.sh --all      check every tracked file
#
# Personal words (your real name, email, street, ...) go one per line in .git/info/private-words.
# That file lives inside .git, so it is never committed or pushed.

mode="${1:---staged}"
root=$(git rev-parse --show-toplevel) || exit 2
cd "$root" || exit 2

if [ "$mode" = "--all" ]; then
  files=$(git ls-files)
  show() { cat -- "$1"; }
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
  show() { git show ":$1"; }
fi
[ -z "$files" ] && exit 0

fail=0
report() { echo "privacy-check: $1"; fail=1; }

for f in $files; do
  case "$f" in
    *.db|*.db-wal|*.db-shm|*.sqlite|*.sqlite-wal|*.sqlite-shm|.samuel/*|*/.samuel/*)
      report "database file: $f" ;;
    .env|*/.env|.env.*|*/.env.*)
      case "$f" in *.env.example) ;; *) report "environment file: $f" ;; esac ;;
    *.pem|*.key|*.p12|*.pfx|id_rsa*|id_ed25519*)
      report "key file: $f" ;;
  esac
  case "$f" in package-lock.json|*/package-lock.json) continue ;; esac
  size=$(show "$f" 2>/dev/null | wc -c)
  [ "${size:-0}" -gt 1048576 ] && report "file over 1 MB: $f"
done

# Text checks on file contents (binary files are skipped by grep -I).
pattern='([A-Za-z]:\\Users\\[A-Za-z][A-Za-z0-9._-]*|/Users/[A-Za-z][A-Za-z0-9._-]*/|/home/[a-z][a-z0-9._-]*/|@(gmail|hotmail|outlook|live|yahoo|icloud|proton|protonmail)\.[a-z.]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})'
words_file="$(git rev-parse --git-dir)/info/private-words"
for f in $files; do
  case "$f" in scripts/privacy-check.sh|*/package-lock.json|package-lock.json) continue ;; esac
  if show "$f" 2>/dev/null | head -c 4096 | grep -Iq '"format": *"samuel-export"'; then
    report "Samuel data export (holds all your personal data): $f"
  fi
  hits=$(show "$f" 2>/dev/null | grep -IinoE "$pattern" | head -3)
  [ -n "$hits" ] && report "possible personal data or secret in $f: $(echo "$hits" | tr '\n' ' ')"
  if [ -s "$words_file" ]; then
    whits=$(show "$f" 2>/dev/null | grep -IinoFwf "$words_file" | head -3 | cut -d: -f1)
    [ -n "$whits" ] && report "a private word from .git/info/private-words is in $f (line $(echo "$whits" | tr '\n' ' '))"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "Commit stopped to protect personal data. Remove it, or use the made-up demo persona instead."
  exit 1
fi
exit 0
