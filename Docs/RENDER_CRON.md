# Render Cron configuration

LifeOS uses three runtime roles on Render:

1. `lifeos-api` — continuous web service.
2. `lifeos-worker` — continuous background worker that executes durable jobs.
3. `lifeos-scheduler` — Render Cron Job that wakes every 15 minutes, enqueues due jobs, and exits.

Cron expression: `*/15 * * * *` (Render cron schedules use UTC).

Command: `npm run scheduler:once`

The scheduler itself does not execute Gmail/Calendar/AI work. It writes due jobs to PostgreSQL; the continuous worker executes them.
