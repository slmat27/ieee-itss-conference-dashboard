from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any


DEFAULT_WORKER_TOKEN_TTL_SECONDS = 3600


def worker_token_secret() -> str:
    return (
        os.environ.get("WORKER_API_TOKEN_SECRET")
        or os.environ.get("APP_STORAGE_SECRET")
        or "local-development-secret"
    )


def create_worker_token(
    *,
    run_id: str,
    owner_key: str,
    ttl_seconds: int = DEFAULT_WORKER_TOKEN_TTL_SECONDS,
) -> str:
    payload = {
        "run_id": run_id,
        "owner_key": owner_key,
        "exp": int(time.time()) + ttl_seconds,
    }
    encoded_payload = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _signature(encoded_payload)
    return f"{encoded_payload}.{signature}"


def verify_worker_token(token: str, *, run_id: str) -> dict[str, Any]:
    try:
        encoded_payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise PermissionError("Invalid worker token.") from exc
    expected = _signature(encoded_payload)
    if not hmac.compare_digest(signature, expected):
        raise PermissionError("Invalid worker token.")
    try:
        payload = json.loads(_unb64(encoded_payload).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise PermissionError("Invalid worker token.") from exc
    if payload.get("run_id") != run_id:
        raise PermissionError("Worker token does not match this run.")
    if int(payload.get("exp", 0) or 0) < int(time.time()):
        raise PermissionError("Worker token expired.")
    owner_key = payload.get("owner_key")
    if not isinstance(owner_key, str) or not owner_key:
        raise PermissionError("Worker token is missing owner scope.")
    return payload


def _signature(encoded_payload: str) -> str:
    digest = hmac.new(
        worker_token_secret().encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return _b64(digest)


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
