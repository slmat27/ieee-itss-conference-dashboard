from __future__ import annotations

from types import SimpleNamespace

from app.kubernetes import (
    KubernetesWorkerBackend,
    LaunchedWorkerJob,
    kubernetes_job_terminal_state,
)


def test_kubernetes_job_state_handles_missing_status_dictionary() -> None:
    assert kubernetes_job_terminal_state({}) == (None, None)
    assert kubernetes_job_terminal_state({"status": None}) == (None, None)


def test_failure_diagnostics_handles_missing_pod_dictionaries(monkeypatch) -> None:
    backend = KubernetesWorkerBackend(
        store=SimpleNamespace(),
        namespace="test",
        worker_image="worker:test",
        worker_api_base_url="http://worker.test",
    )
    monkeypatch.setattr(
        backend,
        "_request_json",
        lambda *_args, **_kwargs: {
            "items": [
                {"metadata": {"name": "worker-without-status"}},
                {"metadata": None, "status": None},
                {"status": {"phase": "Failed"}},
            ]
        },
    )
    monkeypatch.setattr(backend, "_request_text", lambda *_args, **_kwargs: "")

    diagnostics = backend.failure_diagnostics(
        LaunchedWorkerJob(name="job", namespace="test")
    )

    assert "worker-without-status status" in diagnostics
    assert "phase: unknown" in diagnostics
