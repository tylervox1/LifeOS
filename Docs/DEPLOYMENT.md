# LifeOS V2.7 deployment

## Local Docker deployment

1. Copy `.env.example` to `.env`.
2. Replace `APP_SECRET`.
3. Configure Google/OpenAI/SMTP settings as needed.
4. Run:

```bash
docker compose up --build
```

Compose starts:
- PostgreSQL + pgvector
- database migration job
- API
- worker
- scheduler

API:
`http://localhost:3000`

Health:
`GET /api/health`

Readiness:
`GET /api/readiness`

## Production process model

Run API, worker, and scheduler as separate services from the same image.

The migration job should run once before new application tasks are rolled out.

## Secrets

Do not commit `.env`.
Use the host's secret manager for:
- APP_SECRET
- DATABASE_URL
- OPENAI_API_KEY
- GOOGLE_CLIENT_SECRET
- SMTP credentials

## Database backups

A production deployment should enable managed PostgreSQL backups and point-in-time recovery. The application image does not attempt to replace database-provider backup controls.

## Scaling

API instances may scale horizontally.
Workers may scale horizontally because queue claiming uses PostgreSQL row locks.
Run one scheduler replica unless scheduler leadership/deduplication is moved to a stronger distributed lease.
