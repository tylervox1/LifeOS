# LifeOS V3.0 Public Beta Checklist

## Required before inviting external users
- [ ] Production database with automated backups and recovery tested
- [ ] Unique production `APP_SECRET`
- [ ] Unique `ADMIN_API_KEY`
- [ ] HTTPS-only public URL
- [ ] Google OAuth production credentials and redirect URI
- [ ] OpenAI production key and spending controls
- [ ] SMTP transactional email delivery tested
- [ ] Web Push VAPID keys
- [ ] Privacy notice reviewed by qualified counsel
- [ ] Terms reviewed by qualified counsel
- [ ] Operator/company identity and support contact filled into legal pages
- [ ] Account export tested
- [ ] Account deletion tested
- [ ] OAuth disconnect/revoke tested
- [ ] Billing products/prices created if paid plans are enabled
- [ ] Stripe webhook endpoint configured and signature validation tested
- [ ] Sentry/error reporting configured
- [ ] Product analytics configured or intentionally disabled
- [ ] Admin/support key stored in secret manager
- [ ] Rate limiting reviewed for production traffic
- [ ] Gmail/Calendar test accounts exercised end-to-end
- [ ] Approval-gated write actions exercised with a non-personal test account
- [ ] Disaster recovery procedure documented
- [ ] Incident/support ownership assigned

## Beta rollout
Start with a small invite-only cohort. Watch auth failures, Google sync failure rate, queue backlog, assistant errors, notification delivery, support requests, and approval execution failures before expanding access.
