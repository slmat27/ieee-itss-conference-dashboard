ARG NPM_REGISTRY_URL=https://registry.npmjs.org/
ARG PYPI_INDEX_URL=https://pypi.org/simple
ARG UV_VERSION=0.11.7

FROM node:24-slim AS frontend-builder

ARG NPM_REGISTRY_URL
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY_URL}

WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci --cache .npm-cache

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS python-deps

ARG PYPI_INDEX_URL
ARG UV_VERSION

ENV PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=${PYPI_INDEX_URL} \
    UV_DEFAULT_INDEX=${PYPI_INDEX_URL} \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_LINK_MODE=copy

WORKDIR /app

RUN python -m pip install --no-cache-dir "uv==${UV_VERSION}"

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_STORAGE_DIR=/storage \
    FRONTEND_DIST_DIR=/app/static \
    VENV_PATH=/app/.venv

WORKDIR /app

ENV PATH="/app/.venv/bin:${PATH}"

COPY --from=python-deps /app/.venv /app/.venv
COPY app ./app
COPY --from=frontend-builder /frontend/dist ./static

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /storage \
    && chown -R appuser:appuser /app /storage

USER 1000:1000
EXPOSE 8023

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8023"]
