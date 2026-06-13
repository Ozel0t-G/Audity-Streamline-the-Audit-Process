# Audity Demo Mode

Demo Mode is intended for an isolated public test tenant. Do not enable it on a production tenant that contains real customer data.

## Branch

This work belongs to the `audity-demo` branch.

## Security Model

- Public demo users sign in through `/api/demo/public-login`.
- The public demo account can be an admin inside the demo tenant.
- The hidden control plane is separate from normal Audity users and is available at `/control/demo`.
- The control plane requires `AUDITY_DEMO_CONTROL_SECRET_HASH`.
- Optional TOTP hardening is enabled with `AUDITY_DEMO_CONTROL_TOTP_SECRET`.
- Optional IP restriction is enabled with `AUDITY_DEMO_CONTROL_IP_ALLOWLIST`.
- Control sessions expire after 15 minutes.
- Destructive reset is blocked unless `AUDITY_DEMO_RESET_DANGEROUSLY_ALLOW_DATA_DELETION=true`.

## Required Environment

```bash
AUDITY_DEMO_MODE=true
AUDITY_DEMO_PUBLIC_LOGIN_ENABLED=true
AUDITY_DEMO_PUBLIC_LOGIN_EMAIL=demo-admin@audity.local
AUDITY_DEMO_PUBLIC_LOGIN_PASSWORD=replace-with-public-demo-password
AUDITY_DEMO_PUBLIC_LOGIN_ROLE=Instance Admin
AUDITY_DEMO_RESET_ENABLED=true
AUDITY_DEMO_RESET_MINUTES=60
AUDITY_DEMO_RESET_DANGEROUSLY_ALLOW_DATA_DELETION=false
AUDITY_DEMO_CONTROL_SECRET_HASH=replace-with-sha256-or-argon2-control-secret-hash
AUDITY_DEMO_CONTROL_TOTP_SECRET=optional-base32-totp-secret
AUDITY_DEMO_CONTROL_IP_ALLOWLIST=
```

Generate a SHA-256 control secret hash:

```bash
printf '%s' 'your-long-control-secret' | shasum -a 256
```

For a real public demo deployment, use a long random control secret, set TOTP, use HTTPS, use a dedicated database/storage bucket, and enable destructive reset only on that isolated demo stack.

## Current Reset Behavior

The reset worker checks the demo schedule every minute. When the reset is due:

- If destructive reset is disabled, a skipped reset run is recorded and the next reset time is moved forward.
- If destructive reset is enabled, data created by the configured public demo user is removed, demo sessions are revoked, connectors are reset to not configured, and a fresh demo customer/assessment seed is created.

This safety model prevents accidentally deleting data on a non-demo deployment.

## Telemetry

Demo Mode records public/normal login events when telemetry is enabled:

- login method
- timestamp
- user/email
- masked IP by default
- hashed IP by default
- optional raw IP
- browser/device/operating system
- accept-language header

Raw IP storage is off by default and can be toggled in `/control/demo`.
