# testudot

## overview

this is a python-based course monitoring application that fetches course section information from the university of maryland's testudo, tracks changes, and sends email notifications when updates occur.

built for local use and deployment on **render**.

## features

- **persistence**: environment-based state tracking. uses local json files by default for the cli, with optional upstash redis support for cloud deployments (configurable via `PERSISTENCE_MODE`).
- **dockerized**: bundles the app using `uv` for fast, reproducible builds.
- **smart term detection**: automatically targets spring or fall based on the current date (with manual overrides).
- **fastapi server**: full api for health checks, listing mappings, and triggering monitoring cycles.
- **automated monitoring**:
  - tracks **new sections**.
  - tracks **seat availability changes**.
  - tracks **section removals**.
  - sends html email notifications.

## setup

this project uses [uv](https://github.com/astral-sh/uv) for extremely fast dependency management.

```bash
uv sync
```

### environment variables

create a `.env` file with the following:

- `EMAIL_USER`: your gmail address (for local SMTP fallback).
- `EMAIL_PASS`: your gmail **app password** (for local SMTP fallback).
- `RESEND_TOKEN`: your **resend.com** api key (required for production).
- `API_KEY`: a secret key of your choice to restrict API access (e.g., `my-super-secret-key`).
- `EMAIL_FROM`: the verified sender email for resend (defaults to `onboarding@resend.dev`).
- `REDIS_URL`: your upstash redis rest url.
- `REDIS_TOKEN`: your upstash redis rest token.
- `PERSISTENCE_MODE`: set to `redis` or `local` (defaults to `local`).

### setting up resend (for render/production)
render's free tier **blocks all outbound smtp traffic** (ports 25, 465, 587). to send notifications from render, you must use the [resend](https://resend.com) http api:

1.  **sign up**: create a free account at [resend.com](https://resend.com).
2.  **get api key**: create an api key and add it as `RESEND_TOKEN` in your render environment variables.
3.  **set sender**: by default, resend free accounts can only send from `onboarding@resend.dev`. the application uses this as the default `EMAIL_FROM`.
4.  **recipient rule**: on the Resend free tier, you can **only** send emails to the **same email address** you used to sign up for Resend. ensure the email in your `user-course-map.json` matches your Resend account email.

> [!IMPORTANT]
> if you want to send notifications to multiple people or different addresses, you must verify a custom domain in the Resend dashboard.

### api security
to prevent unauthorized users from triggering your monitor or viewing your mappings, you can set an `API_KEY` environment variable.

1. **set the key**: add `API_KEY` to your render environment variables with a secret value.
2. **use the header**: when making requests to `/api/monitor` or `/api/mappings`, include the `X-API-Key` header:
   ```bash
   curl -X POST https://your-app.onrender.com/api/monitor \
     -H "X-API-Key: your-secret-key"
   ```
> [!NOTE]
> the `/api/health` endpoint remains public so you can perform health checks if needed.

## usage

### cli

```bash
# add a mapping
uv run main.py add

# list current mappings
uv run main.py list-mappings

# start the monitor locally (continuous loop)
uv run main.py monitor --interval 15

# run the monitor once (ideal for cron)
uv run main.py monitor --once

# start the api server
uv run main.py serve

# set default persistence mode via config file
uv run main.py config --mode redis
```

notes:
- mappings live in `user-course-map.json`. update this file locally and push to trigger changes in production.
- the `monitor` command prompts for a term id by default. use `--no-prompt` or `--once` for non-interactive runs.

### api endpoints

- `GET /api/mappings`: list all bundled course mappings.
- `POST /api/monitor`: trigger a single monitoring cycle.
- `GET /api/health`: service health status.

## deployment

### render

this project is designed to be deployed to **render** using the provided [render.yaml](render.yaml) blueprint.

1. **connect repository**: connect your github repository to render.
2. **blueprint**: render will automatically detect the blueprint and provision a **web service** (api) and a **cron job** (monitor).
3. **secrets**: set your `EMAIL_USER`, `EMAIL_PASS`, `REDIS_URL`, and `REDIS_TOKEN` in the render dashboard.

the app uses a `Dockerfile` for the build.

## term detection

- **heuristic**: maps oct-feb to spring (`01`) and march-sept to fall (`08`).
- **override**: to target summer (`05`) or winter (`12`), use the `--term` flag in the cli or provide it via the api.

## architecture

- **core**: beautifulsoup4 (scraping), upstash-redis (state)
- **api**: fastapi + uvicorn
- **cli**: typer + rich
- **deployment**: render (docker runtime)

## license

mit license.
