"""Which code a server runs, so `samuel app` can tell a server left over from before an update."""

import hashlib
from functools import cache
from pathlib import Path


@cache
def build_id() -> str:
    """A short fingerprint of the backend code and migrations this process loaded."""
    root = Path(__file__).resolve().parent
    digest = hashlib.sha256()
    for path in sorted([*root.glob("*.py"), *root.glob("migrations/*.sql")]):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]
