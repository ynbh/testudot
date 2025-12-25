FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

# Install system dependencies if needed (none currently required for BeautifulSoup/FastAPI)
# RUN apt-get update && apt-get install -y --no-install-recommends ...

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy project files
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy source code
COPY . .

# Expose port and set env vars
ENV PORT=8000
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Default command (overridden by render.yaml)
CMD ["uv", "run", "main.py", "serve", "--host", "0.0.0.0", "--port", "8000"]
