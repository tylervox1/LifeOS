# LifeOS V2.7 cloud deployment

## Render

`render.yaml` defines:
- one public web service
- one background worker
- one scheduler worker
- one managed PostgreSQL database

Render supports Docker web/worker services and a pre-deploy command, so the API service runs `npm run migrate` before rollout.

Steps:
1. Push this repository to GitHub.
2. Create a Render Blueprint from the repository.
3. Supply all `sync: false` secret values.
4. Set `GOOGLE_REDIRECT_URI` to the deployed `/api/google/callback`.
5. Configure Google Pub/Sub webhook URL if Gmail push is enabled.

## Fly.io

`fly.toml` defines three process groups:
- `web`
- `worker`
- `scheduler`

Only `web` receives HTTP traffic. The readiness endpoint is used as the HTTP health check.

Before first deploy:
1. Change `app = "lifeos-change-me"`.
2. Create/attach PostgreSQL and set `DATABASE_URL`.
3. Set secrets using Fly's secret mechanism.
4. Run database migrations before or as part of release management.
5. Deploy with `fly deploy`.

## CI

GitHub Actions runs:
- migrations against a pgvector PostgreSQL service container
- unit tests
- integration tests
- syntax checks
- production Docker image build

The Google write-action integration test does not contact Google. It uses a local HTTP fake and verifies the approval -> job -> worker execution path.
