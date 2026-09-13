# LifeOS V3.1.1 — Render Deployment Start Here

This package is configured for a small invite-only beta on Render.

## What Render will create

- `lifeos-api` — paid web service, `0.5c-512mb`
- `lifeos-worker` — paid background worker, `0.5c-512mb`
- `lifeos-scheduler` — Render Cron Job, `0.5c-512mb`, runs every 15 minutes and exits
- `lifeos-db` — paid PostgreSQL, `0.1c-256mb`

The database migration enables `pgcrypto` and `vector`. Render Postgres supports pgvector on PostgreSQL 13+.

## Before you deploy

1. Extract this ZIP.
2. Put the extracted files in a GitHub repository. `render.yaml` must be at the repository root.
3. Generate two secrets locally:

```bash
node scripts/generate-secrets.js
```

Save the two printed values somewhere private. Do not commit them.

## Create the Blueprint in Render

1. Sign in to Render.
2. Choose **New > Blueprint**.
3. Connect the GitHub repository containing this package.
4. Render reads `render.yaml` and shows the four resources above.
5. When Render asks for `APP_SECRET` on `lifeos-api`, paste the generated APP_SECRET.
6. When Render asks for `ADMIN_API_KEY`, paste the generated ADMIN_API_KEY.
7. When Render asks for `APP_SECRET` on `lifeos-worker`, paste the **same APP_SECRET** used for `lifeos-api`.
8. Create/apply the Blueprint.

The web service runs migrations with `npm run migrate` before deployment. `/api/readiness` is the health check.

## First successful deploy

Render automatically provides a URL similar to:

`https://lifeos-api.onrender.com`

The application uses Render's built-in `RENDER_EXTERNAL_URL`, so you do not need to know the final URL before the first deploy.

Test these URLs:

- `/api/health`
- `/api/readiness`
- `/api/public/beta-status`
- `/`
- `/admin.html`

## Add integrations after core deployment

Use `RENDER-INTEGRATIONS.env.example` as the checklist. Add values through the Render Dashboard, never to Git.

Important ordering:

1. **OpenAI:** add `OPENAI_API_KEY` to web and worker.
2. **Google:** create/update your Google OAuth application using the real Render URL, then add the Google client ID/secret to web and worker. Set the web redirect URI to `https://YOUR-RENDER-HOST/api/google/callback`.
3. **Worker public URL:** set `APP_PUBLIC_URL=https://YOUR-RENDER-HOST` on `lifeos-worker` before enabling transactional email, so verification/reset links are correct.
4. **Email:** configure SMTP on the worker.
5. **Web Push:** add the same VAPID key pair to web and worker.
6. **Stripe:** add Stripe settings to the web service only after billing is ready to test.
7. **Sentry/PostHog:** optional beta observability.

## Verify the cron conversion

`lifeos-scheduler` runs `npm run scheduler:once` every 15 minutes. It performs one scheduling pass, queues due jobs in PostgreSQL, closes the DB pool, and exits. The continuously running `lifeos-worker` executes the queued jobs.

## Important beta safety

- Invite gating is ON.
- Demo mode is OFF.
- External email/calendar actions remain approval-gated.
- The service worker caches only static assets; `/api` and other sensitive routes are excluded.
- Start with a test Google account, not your primary personal account.

## After deployment

From a machine with this repo checked out, you can run:

```bash
APP_PUBLIC_URL=https://YOUR-RENDER-HOST npm run smoke
```

Then create the first beta invite from `/admin.html`.
