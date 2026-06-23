-- 005_customer_ack_snapshot.sql
-- Frozen report snapshot for customer-ack tokens.
-- Pinned at token-issue time so the customer signs the report state they were emailed about,
-- not whatever the auditor edited later.

alter table customer_ack_tokens
  add column if not exists pinned_snapshot jsonb;
