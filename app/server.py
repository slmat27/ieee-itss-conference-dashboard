from __future__ import annotations

import uvicorn


def main() -> None:
    from .main import app

    settings = app.state.settings
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )


if __name__ == "__main__":
    main()
