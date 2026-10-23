# Truthfolio backend — FastAPI + LangGraph, run as a long-running container.
# (Not serverless: the app warms the AMFI scheme master into memory, streams SSE, and keeps
#  in-process caches — so it wants a persistent process.)
FROM python:3.13-slim

# Faster, quieter Python; no .pyc, unbuffered logs.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first (better layer caching): copy only the manifest, then the code.
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install .

# The host (Render/Fly/etc.) provides $PORT; default to 8077 for local `docker run`.
ENV PORT=8077
EXPOSE 8077

# Shell form so ${PORT} is expanded at runtime.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
