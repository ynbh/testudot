# testudot

## overview

this is a python-based course monitoring application that fetches course section information from the university of maryland's testudo, tracks changes, and sends email notifications when updates occur.

built for local use and **serverless deployment** (vercel).

important: serverless functions run on a read-only filesystem. on vercel, persistence is intentionally redis-only. local file-based state is available for the cli on your machine, but is not used on the server.

## features

- **serverless persistence via redis**: uses upstash redis for reliable state tracking in serverless environments.
- **local cli persistence via files**: when run locally, state is saved under `state/` for delta detection between runs.
- **smart term detection**: automatically targets spring or fall based on the current date (see notes below).
- **fastapi server**: built-in api for triggering monitors via cron or webhooks.
- **email notifications**:
  - new sections
  - seat availability changes
  - section removals

## setup

this project uses [uv](https://github.com/astral-sh/uv) for extremely fast dependency management.

```bash
uv sync
```

### environment variables

create a `.env` file with the following:

- `EMAIL_USER`: your gmail address.
- `EMAIL_PASS`: your gmail **app password**.
- `REDIS_URL`: your upstash redis rest url (e.g., `https://...`).
- `REDIS_TOKEN`: your upstash redis rest token.
- `PERSISTENCE_MODE`: set to `redis` or `local` (defaults to `local` for cli, forced to `redis` on serverless).

> [!NOTE]
> for gmail notifications, you must enable 2FA and create an **app password**.

## usage

### cli

```bash
# add a mapping
uv run main.py add

# list current mappings
uv run main.py list-mappings

# start the monitor locally
uv run main.py monitor --interval 15

# start the api server
uv run main.py serve

# set persistence mode to redis 
uv run main.py config --mode redis
```

notes:
- mappings live in `user-course-map.json`. to use them on vercel, commit and push this file after adding or changing mappings locally.
- the monitor command will prompt for a term id; you can accept the detected value or override it (useful around term transitions or for summer/winter).
- the `serve` command runs uvicorn in reload mode

### api endpoints

- `GET /api/mappings`: list all bundled course mappings.
- `POST /api/monitor`: trigger a single monitoring cycle
- `GET /api/health`: check service status.

## deployment

### vercel

1. push this repository to github.
2. connect to vercel.
3. add `EMAIL_USER`, `EMAIL_PASS`, `REDIS_URL`, and `REDIS_TOKEN` as environment variables.
4. the `vercel.json` file handles the cron job:

```json
{
  "crons": [
    {
      "path": "/api/monitor",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

> [!IMPORTANT]
> **persistence**: serverless environments are read-only. you **must** configure upstash redis for delta-tracking to work across cron cycles. without redis, the server runs in a stateless mode and cannot remember previous sections between invocations; enabling cron without redis will likely result in duplicate notifications.

> [!TIP]
> mappings used by vercel come from the repository. run `uv run main.py add` locally, then commit and push `user-course-map.json` so the deployment picks up your changes.

## term detection

- current heuristic maps dates to spring (`01`) and fall (`08`).
- to target summer (`05`) or winter (`12`), run the cli monitor and override the prompted term id. the serverless job uses the heuristic.

## architecture

- **frontend**: fastapi (api entry points)
- **logic**: beautifulsoup4 (scraping), upstash-redis (state)
- **tools**: typer (cli), rich (ui)

## license

mit license.
