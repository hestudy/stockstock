# Security & Configuration Policy

This document records the minimal security posture for the StockStock project. It covers secret sources, rotation strategy, CI handling, and rate limit policy for sensitive endpoints.

## Secrets Inventory

- NEXT_PUBLIC_SUPABASE_URL (public)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (public but scoped)
- SUPABASE_SERVICE_KEY (backend only, high sensitivity)
- SENTRY_DSN (optional; error reporting)
- OTEL_EXPORTER_OTLP_ENDPOINT (optional; metrics exporter)
- OTEL_RESOURCE_ATTRIBUTES (optional; metrics resource labels)

## Sources & Storage

- Local development: use `.env.local` in `apps/web/` (do not commit)
- CI/CD: GitHub Actions Encrypted Secrets
  - Repository Settings → Secrets and variables → Actions → New repository secret
  - Never echo secret values in logs
- Production: Managed secret store (e.g., Vercel project env, or cloud secret manager)

## Rotation Strategy

- SUPABASE_SERVICE_KEY: rotate every 90 days, or immediately on suspected exposure. Maintain key versions and roll forward clients.
- SENTRY_DSN: rotate on incident or provider migration.
- OTEL_EXPORTER_OTLP_ENDPOINT: changeable without rotation; ensure network ACLs restrict egress to trusted endpoints.
- Document rotation dates in internal runbook; use calendar reminders.

## Principle of Least Privilege

- Frontend only uses `NEXT_PUBLIC_*` keys.
- Service keys (e.g., SUPABASE_SERVICE_KEY) used strictly in backend/server contexts.

## CI Validation

- Workflows must read secrets via `${{ secrets.* }}`.
- Avoid printing any secret to logs. When verifying presence, only check for existence (non-empty) without printing value.

## Rate Limit Policy (Sensitive Endpoints)

| Endpoint                     | Method | Window | Limit | Overflow Response |
|-----------------------------|--------|--------|-------|-------------------|
| /api/v1/backtests           | POST   | 10s    | 5     | 429 JSON `{ reason: "rate_limited" }` |

Notes:
- Implementation lives in `apps/web/src/app/api/_lib/rateLimit.ts` and is used by `apps/web/src/app/api/v1/backtests/route.ts`.
- Test bypass available via `RATE_LIMIT_DISABLED=1` in controlled environments.
- For production, replace in-memory limiter with a distributed backend (e.g., Redis) and IP/user-scoped keys.

## Error Handling & Data Hygiene

- API responses use unified `ApiError` structure; avoid leaking stack traces or internal identifiers.
- Logs/metrics must not contain secrets, tokens, or personally identifiable information.

## Incident Response

- On suspected exposure, revoke the affected credential, rotate, and audit access logs.
- Notify maintainers and update this document if controls change.
