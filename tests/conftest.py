from __future__ import annotations

import os


def pytest_configure() -> None:
    os.environ["APP_ENV"] = "test"
    os.environ["DATABASE_URL"] = ""
