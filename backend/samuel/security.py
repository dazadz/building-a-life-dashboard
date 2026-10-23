"""Protections for a server that only ever serves its owner on this computer.

Binding to 127.0.0.1 keeps other machines out, but web pages open in the owner's own browser can
still send requests to localhost. These checks stop them:

- Host check: refuse requests not addressed to localhost, which blocks DNS rebinding (a page
  pointing its own domain at 127.0.0.1 to read the API as "same site").
- Cross-site writes: refuse changes that come from another site, or that aren't JSON.
- Headers: forbid framing and outside scripts, and never leak the URL as a referrer.
"""

from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; "
        "form-action 'self'; frame-ancestors 'none'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


def hostname(value: str) -> str:
    """The host part of a Host header or URL netloc, without the port."""
    value = value.strip().lower()
    if value.startswith("["):  # IPv6, e.g. [::1]:8765
        return value[1:].split("]", 1)[0]
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


def _refuse(status: int, detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=status, headers=HEADERS)


def protect(app: FastAPI, allowed_hosts: set[str] = LOCAL_HOSTS) -> None:
    @app.middleware("http")
    async def guard(request: Request, call_next):
        if hostname(request.headers.get("host", "")) not in allowed_hosts:
            return _refuse(421, "Samuel only answers requests addressed to localhost")

        if request.method in WRITE_METHODS:
            origin = request.headers.get("origin")
            if origin is not None and hostname(urlsplit(origin).netloc) not in allowed_hosts:
                return _refuse(403, "Cross-site request refused")
            if request.headers.get("sec-fetch-site") == "cross-site":
                return _refuse(403, "Cross-site request refused")
            content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
            if content_type != "application/json":
                return _refuse(415, "Send JSON")

        response = await call_next(request)
        for name, value in HEADERS.items():
            response.headers.setdefault(name, value)
        return response
