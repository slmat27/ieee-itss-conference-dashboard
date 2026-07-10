from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_MODEL_ALIAS = "default-reasoning"


@dataclass(frozen=True, slots=True)
class LlmGatewayConfig:
    base_url: str
    api_key: str
    allowed_model_aliases: tuple[str, ...]
    default_model_alias: str


def load_llm_gateway_config() -> LlmGatewayConfig:
    # CREATOR_AGENT_CONTRACT: Generated POCs must use the platform LLM gateway
    # and model aliases. Do not hard-code provider endpoints or provider keys.
    allowed_aliases = tuple(
        item.strip()
        for item in os.environ.get(
            "PLATFORM_ALLOWED_MODEL_ALIASES",
            DEFAULT_MODEL_ALIAS,
        ).split(",")
        if item.strip()
    )
    return LlmGatewayConfig(
        base_url=os.environ.get("PLATFORM_LLM_BASE_URL", "").strip(),
        api_key=os.environ.get("PLATFORM_LLM_API_KEY", "").strip(),
        allowed_model_aliases=allowed_aliases,
        default_model_alias=allowed_aliases[0] if allowed_aliases else DEFAULT_MODEL_ALIAS,
    )


def require_allowed_model_alias(model_alias: str | None = None) -> str:
    config = load_llm_gateway_config()
    selected = (model_alias or config.default_model_alias).strip()
    if selected not in config.allowed_model_aliases:
        raise ValueError(
            "Model alias is not allowed by PLATFORM_ALLOWED_MODEL_ALIASES: "
            f"{selected}"
        )
    return selected
