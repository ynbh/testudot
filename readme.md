# Testudot

## Overview

This is a Python-based course monitoring application that fetches course section information from the University of Maryland's Testudo, tracks changes, and sends email notifications when updates occur.

Built for local use and deployment on **Render**.

## Features

- **Persistence**: Environment-based state tracking. Uses local JSON files by default for the CLI, with optional Upstash Redis support for cloud deployments (configurable via `PERSISTENCE_MODE`).
- **Dockerized**: Bundles the app using `uv` for fast, reproducible builds.
- **Smart Term Detection**: Automatically targets Spring or Fall based on the current date (with manual overrides).
- **FastAPI Server**: Full API for health checks, listing mappings, and triggering monitoring cycles.
- **Automated Monitoring**:
  - Tracks **new sections**.
  - Tracks **seat availability changes**.
  - Tracks **section removals**.
  - Sends HTML email notifications.

## Setup

This project uses [uv](https://github.com/astral-sh/uv) for extremely fast dependency management.

```bash
uv sync
```

### Environment Variables

Create a `.env` file with the following:

- `EMAIL_USER`: Your Gmail address (for local SMTP fallback).
- `EMAIL_PASS`: Your Gmail **app password** (for local SMTP fallback).
- `RESEND_TOKEN`: Your **resend.com** API key (required for production).
- `API_KEY`: A secret key of your choice to restrict API access (e.g., `my-super-secret-key`).
- `EMAIL_FROM`: The verified sender email for Resend (defaults to `onboarding@resend.dev`).
- `REDIS_URL`: Your Upstash Redis REST URL.
- `REDIS_TOKEN`: Your Upstash Redis REST token.
- `PERSISTENCE_MODE`: Set to `redis` or `local` (defaults to `local`).

### Setting up Resend (for Render/Production)

Render's free tier **blocks all outbound SMTP traffic** (ports 25, 465, 587). To send notifications from Render, you must use the [Resend](https://resend.com) HTTP API:

1.  **Sign up**: Create a free account at [resend.com](https://resend.com).
2.  **Get API key**: Create an API key and add it as `RESEND_TOKEN` in your Render environment variables.
3.  **Set sender**: By default, Resend free accounts can only send from `onboarding@resend.dev`. The application uses this as the default `EMAIL_FROM`.
4.  **Recipient rule**: On the Resend free tier, you can **only** send emails to the **same email address** you used to sign up for Resend. Ensure the email in your `user-course-map.json` matches your Resend account email.

> [!IMPORTANT]
> If you want to send notifications to multiple people or different addresses, you must verify a custom domain in the Resend dashboard.

### API Security

To prevent unauthorized users from triggering your monitor or viewing your mappings, you can set an `API_KEY` environment variable.

1. **Set the key**: Add `API_KEY` to your Render environment variables with a secret value.
2. **Use the header**: When making requests to `/api/monitor` or `/api/mappings`, include the `X-API-Key` header:
   ```bash
   curl -X POST https://your-app.onrender.com/api/monitor \
     -H "X-API-Key: your-secret-key"
   ```
> [!NOTE]
> The `/api/health` endpoint remains public so you can perform health checks if needed.

## Usage

### CLI

```bash
# Add a mapping
uv run main.py add

# List current mappings
uv run main.py list-mappings

# Start the monitor locally (continuous loop)
uv run main.py monitor --interval 15

# Run the monitor once (ideal for cron)
uv run main.py monitor --once

# Start the API server
uv run main.py serve

# Set default persistence mode via config file
uv run main.py config --mode redis
```

Notes:
- Mappings live in `user-course-map.json`. Update this file locally and push to trigger changes in production.
- The `monitor` command prompts for a term ID by default. Use `--no-prompt` or `--once` for non-interactive runs.

### API Endpoints

- `GET /api/mappings`: List all bundled course mappings.
- `POST /api/monitor`: Trigger a single monitoring cycle.
- `GET /api/health`: Service health status.

## Deployment

### Render

This project is designed to be deployed to **Render** using the provided [render.yaml](render.yaml) blueprint.

1. **Connect repository**: Connect your GitHub repository to Render.
2. **Blueprint**: Render will automatically detect the blueprint and provision a **web service** (API).
3. **Secrets**: Set your `EMAIL_USER`, `EMAIL_PASS`, `REDIS_URL`, `REDIS_TOKEN`, and `API_KEY` in the Render dashboard.

#### Automation (GitHub Actions)

To trigger the monitor every 30 minutes for free, use the included GitHub Action:

1. **GitHub Secrets**: In your repo settings, go to `Settings > Secrets and variables > Actions` and add:
   - `RENDER_URL`: Your app's public URL (e.g., `https://testudot.onrender.com`).
   - `API_KEY`: The same secret key you set in Render.
2. **Enable**: The action in `.github/workflows/monitor.yml` will now run automatically every 30 minutes.

## Term Detection

- **Heuristic**: Maps Oct-Feb to Spring (`01`) and March-Sept to Fall (`08`).
- **Override**: To target Summer (`05`) or Winter (`12`), use the `--term` flag in the CLI or provide it via the API.

## Architecture

- **Core**: BeautifulSoup4 (scraping), Upstash-Redis (state)
- **API**: FastAPI + Uvicorn
- **CLI**: Typer + Rich
- **Deployment**: Render (Docker runtime)

## License

MIT License.

