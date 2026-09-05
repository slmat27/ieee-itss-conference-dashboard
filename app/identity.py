from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from starlette.requests import HTTPConnection


@dataclass(frozen=True, slots=True)
class UserIdentity:
    user_id: str
    email: str
    display_name: str
    groups: tuple[str, ...] = ()


def current_user(
    request: HTTPConnection,
    *,
    allow_anonymous_local: bool,
) -> UserIdentity:
    # CREATOR_AGENT_CONTRACT: Promoted apps must trust identity only from
    # oauth2-proxy/Istio-mediated headers. Do not add client-supplied user ids,
    # query parameters, or local login forms here.
    user = (
        request.headers.get("x-auth-request-user")
        or request.headers.get("x-forwarded-user")
        or ""
    ).strip()
    email = (
        request.headers.get("x-auth-request-email")
        or request.headers.get("x-forwarded-email")
        or user
    ).strip()
    display_name = (
        request.headers.get("x-auth-request-preferred-username")
        or request.headers.get("x-forwarded-preferred-username")
        or email
        or user
    ).strip()
    groups = _parse_groups(
        request.headers.get("x-auth-request-groups")
        or request.headers.get("x-forwarded-groups")
        or ""
    )

    if user:
        return UserIdentity(
            user_id=user,
            email=email or user,
            display_name=display_name or email or user,
            groups=groups,
        )

    if allow_anonymous_local:
        # CREATOR_AGENT_CONTRACT: This fallback is for local development only.
        # Do not enable it in promoted app values.
        return UserIdentity(
            user_id="local-user",
            email="local@example.local",
            display_name="Local User",
            groups=("local-developer",),
        )

    raise PermissionError("Missing trusted identity headers.")


def storage_user_key(identity: UserIdentity, *, secret: str) -> str:
    # CREATOR_AGENT_CONTRACT: Owner keys partition app-managed storage by the
    # authenticated user without storing raw stable user ids in paths.
    return hmac.new(
        secret.encode("utf-8"),
        identity.user_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:32]


def _parse_groups(raw: str) -> tuple[str, ...]:
    # CREATOR_AGENT_OPTIONAL: Extend this if your identity provider uses a
    # different group header encoding.
    return tuple(item.strip() for item in raw.split(",") if item.strip())
