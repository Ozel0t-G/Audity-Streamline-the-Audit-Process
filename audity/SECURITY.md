# Security

## Reporting

Report security issues privately to the repository owner. Do not create a public issue with exploit details.

Include:

- Affected route or component.
- Reproduction steps.
- Expected and actual impact.
- Suggested mitigation, if known.

## Local Security Defaults

- API responses include security headers through Helmet.
- API requests are rate limited through Redis.
- Auth routes have stricter rate limits than general API routes.
- Sensitive package/export payloads use AES-256-GCM.
- SMTP passwords are encrypted at rest.
- Containers run non-root where practical and use read-only filesystems with tmpfs scratch paths.

## Production Notes

- Replace all default secrets.
- Use HTTPS and set `AUDITY_PUBLIC_URL` to the HTTPS origin.
- Restrict MinIO, PostgreSQL, Redis, and Docker host access.
- Configure real SMTP credentials only through trusted admin accounts.
- Run dependency review before any production deployment.

