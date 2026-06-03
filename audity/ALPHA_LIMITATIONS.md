# Alpha Limitations

Audity is currently an alpha/beta test build.

- Do not use placeholder secrets from `.env.example` outside local testing.
- SMTP delivery is skipped unless SMTP is explicitly enabled and configured.
- Framework content is an assessment aid and does not replace licensed standards or professional judgement.
- The framework disclaimer is shown persistently in the Framework Library.
- Every user must accept the alpha disclaimer on first login before using protected app pages.
- Evidence backup copies objects and writes a manifest; object-level restore should still be verified against the storage bucket.
- The app is intended for controlled test environments until the full Step 10 smoke test has been completed.
- Security dependency audit still reports known high severity findings in transitive packages; breaking `npm audit fix --force` has not been applied.
