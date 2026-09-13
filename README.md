# LifeOS — Render Deployment Repository

This repository is ready to upload directly to GitHub and deploy to Render using the root-level `render.yaml`.

## Deploy from GitHub to Render

1. Create a new empty GitHub repository.
2. Upload **all files and folders from this repository root**.
3. Do not upload a `.env` file or any secrets.
4. In Render, choose **New → Blueprint**.
5. Connect this GitHub repository.
6. Render reads `render.yaml` and creates:
   - `lifeos-api`
   - `lifeos-worker`
   - `lifeos-scheduler`
   - `lifeos-db`
7. Supply the required secrets when Render prompts you.

Read `START-HERE-RENDER.md` before the first deployment.

---

# LifeOS V3.1 — Public Beta Launch Execution

V3.1 closes the gap between a beta-ready codebase and an invite-only beta.

## New
- invite-code registration gate
- public beta waitlist
- invite usage limits and redemption tracking
- admin invite/waitlist APIs
- `/admin.html` operations console
- sign-in / beta-registration / waitlist UI
- scheduler fix: Google jobs only for Google-connected users
- strict production configuration validation
- hardened Render blueprint
- Fly release-command migrations
- non-root Docker runtime
- production smoke-test script
- launch-readiness check

## Commands
```bash
npm run launch:check
npm run migrate
npm start
npm run worker
npm run scheduler:once  # Render Cron Job
npm run smoke
```

## Important
This package is deploy-ready, not deployed. A real public URL, database, Google OAuth app, OpenAI key, mail delivery, push keys, and any enabled Stripe billing must be configured in the chosen hosting account.

The admin console requires both a normal signed-in LifeOS session and the separate `ADMIN_API_KEY`.

External actions remain approval-gated:
`AI proposal -> explicit approval -> durable job -> worker -> provider -> audit log`


## Render scheduler configuration

For Render, the scheduler is now a Cron Job rather than a continuously running worker.

- Schedule: every 15 minutes (`*/15 * * * *`, UTC)
- Command: `npm run scheduler:once`
- The job enqueues due LifeOS work and exits.
- The existing background worker remains continuously running to execute queued jobs.

This reduces idle scheduler compute. Render bills Cron Jobs only while they run, subject to Render's monthly minimum for a cron service.
