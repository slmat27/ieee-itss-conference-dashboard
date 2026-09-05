from __future__ import annotations

import json
import os
import re
import ssl
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

from .storage import RunRecord, RunStore
from .worker_api import create_worker_token

SERVICE_ACCOUNT_ROOT = Path("/var/run/secrets/kubernetes.io/serviceaccount")
WORKER_NAME_PREFIX = "creator-poc"


@dataclass(frozen=True, slots=True)
class LaunchedWorkerJob:
    name: str
    namespace: str


class KubernetesWorkerBackend:
    def __init__(
        self,
        *,
        store: RunStore,
        namespace: str,
        worker_image: str,
        worker_api_base_url: str,
        image_pull_policy: str = "IfNotPresent",
        image_pull_secret_names: tuple[str, ...] = (),
        ttl_seconds_after_finished: int = 300,
        backoff_limit: int = 0,
        poll_interval_seconds: float = 1.0,
        worker_token_secret: str = "local-development-secret",
    ) -> None:
        self.store = store
        self.namespace = namespace
        self.worker_image = worker_image
        self.worker_api_base_url = worker_api_base_url.rstrip("/")
        self.image_pull_policy = image_pull_policy
        self.image_pull_secret_names = image_pull_secret_names
        self.ttl_seconds_after_finished = ttl_seconds_after_finished
        self.backoff_limit = backoff_limit
        self.poll_interval_seconds = poll_interval_seconds
        self.worker_token_secret = worker_token_secret

    def launch(self, record: RunRecord) -> LaunchedWorkerJob:
        self.store.build_worker_bundle(record)
        token = create_worker_token(
            run_id=record.run_id,
            owner_key=record.owner_key,
            secret=self.worker_token_secret,
        )
        manifest = self.worker_job_manifest(record, token=token)
        payload = self._request_json(
            "POST",
            f"/apis/batch/v1/namespaces/{self.namespace}/jobs",
            payload=manifest,
        )
        name = (
            payload.get("metadata", {}).get("name")
            if isinstance(payload.get("metadata"), dict)
            else None
        )
        return LaunchedWorkerJob(
            name=str(name or manifest["metadata"]["name"]),
            namespace=self.namespace,
        )

    def wait(self, launched: LaunchedWorkerJob) -> tuple[str, str | None]:
        path = f"/apis/batch/v1/namespaces/{launched.namespace}/jobs/{launched.name}"
        while True:
            payload = self._request_json("GET", path)
            state, error = kubernetes_job_terminal_state(payload)
            if state is not None:
                return state, error
            time.sleep(self.poll_interval_seconds)

    def cancel(self, launched: LaunchedWorkerJob) -> bool:
        path = f"/apis/batch/v1/namespaces/{launched.namespace}/jobs/{launched.name}"
        try:
            self._request_json(
                "DELETE",
                path,
                payload={"propagationPolicy": "Background"},
            )
        except HTTPError as exc:
            if exc.code == 404:
                return False
            raise
        return True

    def failure_diagnostics(
        self,
        launched: LaunchedWorkerJob,
        *,
        tail_lines: int = 200,
    ) -> str:
        selector = quote(f"job-name={launched.name}", safe="")
        payload = self._request_json(
            "GET",
            f"/api/v1/namespaces/{launched.namespace}/pods?labelSelector={selector}",
        )
        sections: list[str] = []
        for item in payload.get("items", []) or []:
            if not isinstance(item, dict):
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            status = item.get("status") if isinstance(item.get("status"), dict) else {}
            pod_name = str(metadata.get("name") or "")
            if not pod_name:
                continue
            sections.append(_pod_status_summary(pod_name, status))
            try:
                log_text = self._request_text(
                    "GET",
                    f"/api/v1/namespaces/{launched.namespace}/pods/{pod_name}/log"
                    f"?container=poc-worker&tailLines={tail_lines}",
                )
            except HTTPError as exc:
                log_text = f"Unable to read worker container logs: HTTP {exc.code}"
            if log_text.strip():
                sections.append(
                    f"--- {pod_name}/poc-worker log tail ---\n{log_text.rstrip()}"
                )
        return "\n\n".join(section for section in sections if section.strip())

    def worker_job_manifest(self, record: RunRecord, *, token: str) -> dict[str, Any]:
        app_id = os.environ.get("APP_ID", "creator-poc")
        labels = {
            "app.kubernetes.io/name": WORKER_NAME_PREFIX,
            "app.kubernetes.io/component": "analysis-worker",
            "agentic-platform/app-id": app_id,
            "istio.io/dataplane-mode": "ambient",
            "creator-poc/run-id": sanitize_kubernetes_name(record.run_id),
        }
        job_name = sanitize_kubernetes_name(f"{WORKER_NAME_PREFIX}-{record.run_id}")
        env: list[dict[str, Any]] = [
            {"name": "WORKER_API_TOKEN", "value": token},
            {"name": "HOME", "value": "/job/runtime/home"},
            {"name": "XDG_CONFIG_HOME", "value": "/job/runtime/home/.config"},
            {"name": "XDG_CACHE_HOME", "value": "/job/runtime/home/.cache"},
            {"name": "XDG_DATA_HOME", "value": "/job/runtime/home/.local/share"},
            {"name": "XDG_STATE_HOME", "value": "/job/runtime/home/.local/state"},
            {"name": "TMPDIR", "value": "/job/runtime/tmp"},
        ]
        if os.environ.get("PLATFORM_LLM_BASE_URL"):
            env.append(
                {
                    "name": "PLATFORM_LLM_BASE_URL",
                    "value": os.environ["PLATFORM_LLM_BASE_URL"],
                }
            )
        api_key_secret_name = os.environ.get(
            "ISOLATED_WORKER_PLATFORM_LLM_API_KEY_SECRET_NAME",
            "",
        ).strip()
        api_key_secret_key = os.environ.get(
            "ISOLATED_WORKER_PLATFORM_LLM_API_KEY_SECRET_KEY",
            "",
        ).strip()
        if api_key_secret_name and api_key_secret_key:
            env.append(
                {
                    "name": "PLATFORM_LLM_API_KEY",
                    "valueFrom": {
                        "secretKeyRef": {
                            "name": api_key_secret_name,
                            "key": api_key_secret_key,
                        }
                    },
                }
            )
        elif os.environ.get("PLATFORM_LLM_API_KEY"):
            env.append(
                {"name": "PLATFORM_LLM_API_KEY", "value": os.environ["PLATFORM_LLM_API_KEY"]}
            )
        for env_name in _forwarded_worker_env_names():
            value = os.environ.get(env_name)
            if value:
                env.append({"name": env_name, "value": value})

        pod_spec: dict[str, Any] = {
            "automountServiceAccountToken": False,
            "restartPolicy": "Never",
            "securityContext": {
                "runAsNonRoot": True,
                "runAsUser": 1000,
                "runAsGroup": 1000,
                "seccompProfile": {"type": "RuntimeDefault"},
            },
            "containers": [
                {
                    "name": "poc-worker",
                    "image": self.worker_image,
                    "imagePullPolicy": self.image_pull_policy,
                    "command": ["python", "-m", "app.worker"],
                    "args": [
                        "--bundle-url",
                        f"{self.worker_api_base_url}/internal/worker/{record.run_id}/bundle",
                        "--result-url",
                        f"{self.worker_api_base_url}/internal/worker/{record.run_id}/result",
                        "--progress-url",
                        f"{self.worker_api_base_url}/internal/worker/{record.run_id}/progress",
                        "--workspace-dir",
                        "/job/workspace",
                    ],
                    "env": env,
                    "securityContext": {
                        "allowPrivilegeEscalation": False,
                        "capabilities": {"drop": ["ALL"]},
                        "readOnlyRootFilesystem": True,
                        "runAsNonRoot": True,
                        "runAsUser": 1000,
                        "runAsGroup": 1000,
                    },
                    "volumeMounts": [
                        {"name": "workspace", "mountPath": "/job/workspace"},
                        {"name": "runtime", "mountPath": "/job/runtime"},
                        {"name": "tmp", "mountPath": "/tmp"},
                    ],
                }
            ],
            "volumes": [
                {"name": "workspace", "emptyDir": {}},
                {"name": "runtime", "emptyDir": {}},
                {"name": "tmp", "emptyDir": {}},
            ],
        }
        worker_service_account_name = os.environ.get(
            "ISOLATED_WORKER_SERVICE_ACCOUNT_NAME",
            "",
        ).strip()
        if worker_service_account_name:
            pod_spec["serviceAccountName"] = worker_service_account_name
        if self.image_pull_secret_names:
            pod_spec["imagePullSecrets"] = [
                {"name": name} for name in self.image_pull_secret_names
            ]
        return {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "metadata": {"name": job_name, "namespace": self.namespace, "labels": labels},
            "spec": {
                "backoffLimit": self.backoff_limit,
                "ttlSecondsAfterFinished": self.ttl_seconds_after_finished,
                "template": {"metadata": {"labels": labels}, "spec": pod_spec},
            },
        }

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{_kubernetes_api_base_url()}{path}",
            data=body,
            method=method,
            headers={
                "Authorization": f"Bearer {_service_account_token()}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        context = ssl.create_default_context(cafile=str(SERVICE_ACCOUNT_ROOT / "ca.crt"))
        with urlopen(request, context=context, timeout=15) as response:
            return json.loads(response.read().decode("utf-8") or "{}")

    def _request_text(self, method: str, path: str) -> str:
        request = Request(
            f"{_kubernetes_api_base_url()}{path}",
            method=method,
            headers={
                "Authorization": f"Bearer {_service_account_token()}",
                "Accept": "text/plain",
            },
        )
        context = ssl.create_default_context(cafile=str(SERVICE_ACCOUNT_ROOT / "ca.crt"))
        with urlopen(request, context=context, timeout=15) as response:
            return response.read().decode("utf-8", errors="replace")


def kubernetes_job_terminal_state(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    status = payload.get("status")
    if not isinstance(status, dict):
        return None, None
    if int(status.get("succeeded", 0) or 0) > 0:
        return "completed", None
    if int(status.get("failed", 0) or 0) > 0:
        return "failed", _failed_condition_message(status)
    for condition in status.get("conditions", []) or []:
        if not isinstance(condition, dict) or condition.get("status") != "True":
            continue
        if condition.get("type") == "Complete":
            return "completed", None
        if condition.get("type") == "Failed":
            return "failed", str(
                condition.get("message") or condition.get("reason") or ""
            ).strip() or None
    return None, None


def sanitize_kubernetes_name(value: str) -> str:
    candidate = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
    candidate = re.sub(r"-+", "-", candidate)[:63].rstrip("-")
    return candidate or WORKER_NAME_PREFIX


def _failed_condition_message(status: dict[str, Any]) -> str | None:
    for condition in status.get("conditions", []) or []:
        if not isinstance(condition, dict):
            continue
        if condition.get("type") == "Failed" and condition.get("status") == "True":
            return str(condition.get("message") or condition.get("reason") or "").strip()
    return None


def _pod_status_summary(pod_name: str, status: dict[str, Any]) -> str:
    lines = [f"--- {pod_name} status ---", f"phase: {status.get('phase') or 'unknown'}"]
    reason = status.get("reason")
    message = status.get("message")
    if reason:
        lines.append(f"reason: {reason}")
    if message:
        lines.append(f"message: {message}")
    for container in status.get("containerStatuses", []) or []:
        if not isinstance(container, dict):
            continue
        name = container.get("name") or "container"
        state = _container_state_summary(container.get("state"))
        restart_count = container.get("restartCount", 0)
        lines.append(f"{name}: {state}; restarts={restart_count}")
    return "\n".join(lines)


def _container_state_summary(value: Any) -> str:
    if not isinstance(value, dict):
        return "unknown"
    for state_name in ("waiting", "running", "terminated"):
        state = value.get(state_name)
        if not isinstance(state, dict):
            continue
        details = [state_name]
        reason = state.get("reason")
        exit_code = state.get("exitCode")
        message = state.get("message")
        if reason:
            details.append(f"reason={reason}")
        if exit_code is not None:
            details.append(f"exitCode={exit_code}")
        if message:
            details.append(f"message={message}")
        return ", ".join(details)
    return "unknown"


def _kubernetes_api_base_url() -> str:
    host = os.environ.get("KUBERNETES_SERVICE_HOST")
    if not host:
        raise RuntimeError("KUBERNETES_SERVICE_HOST is not set.")
    port = os.environ.get("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    return f"https://{host}:{port}"


def _service_account_token() -> str:
    return (SERVICE_ACCOUNT_ROOT / "token").read_text(encoding="utf-8").strip()


def _forwarded_worker_env_names() -> tuple[str, ...]:
    names = {
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "REQUESTS_CA_BUNDLE",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "NODE_EXTRA_CA_CERTS",
    }
    extra = os.environ.get("ISOLATED_WORKER_ENV_ALLOWLIST", "")
    names.update(item.strip() for item in extra.split(",") if item.strip())
    return tuple(sorted(names))
