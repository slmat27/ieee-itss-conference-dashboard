from __future__ import annotations

from pydantic import BaseModel


class StoredFilePayload(BaseModel):
    original_name: str
    stored_name: str
    relative_path: str
    size_bytes: int


class RunLogPayload(BaseModel):
    name: str
    relative_path: str
    size_bytes: int


class RunSummary(BaseModel):
    run_id: str
    title: str
    state: str
    created_at: str
    updated_at: str
    started_at: str | None
    completed_at: str | None
    status_message: str | None = None
    workflow_delay_seconds: float
    input_files: list[StoredFilePayload]
    output_files: list[StoredFilePayload]
    error: str | None = None


class RunDetail(RunSummary):
    logs: list[RunLogPayload]
    download_urls: dict[str, str]


class CreateRunResponse(BaseModel):
    run_id: str
    state: str
    status_url: str


class RunsListResponse(BaseModel):
    items: list[RunSummary]
    summary: dict[str, int]


class CurrentUserResponse(BaseModel):
    user_id: str
    email: str
    display_name: str
    groups: list[str]


class ConfigResponse(BaseModel):
    display_name: str
    description: str
    max_upload_files: int
    max_upload_size_bytes: int
    allowed_model_aliases: list[str]
    default_model_alias: str
    workflow_delay_seconds: float
    workflow_output_tag: str
    retention_cleanup_enabled: bool
    retention_days: float
