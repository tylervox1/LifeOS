# V2.7 integration tests

These tests use a real PostgreSQL database and a local fake Google HTTP server.

Covered:
- account/data isolation between users
- CSRF rejection/acceptance
- durable queue deduplication and single-claim behavior
- approval-gated Gmail draft execution
- execution-result persistence

Run after migrations:

```bash
TEST_DATABASE_URL=postgres://... npm run test:integration
```
