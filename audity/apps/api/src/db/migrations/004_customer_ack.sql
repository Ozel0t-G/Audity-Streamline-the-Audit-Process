-- 004_customer_ack.sql
-- Customer magic-link acknowledgment tokens + signoff extensions + closure flags.
-- Idempotent.

create table if not exists customer_ack_tokens (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  recipient_email text not null,
  recipient_hint text,
  token_hash text not null unique,
  issued_by_user_id uuid not null references users(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_email text,
  redeemed_signoff_id uuid references audit_signoffs(id),
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id),
  revoke_reason text,
  message text,
  report_version_at_issue integer not null default 1,
  email_send_status text not null default 'pending',
  email_send_error text,
  last_opened_at timestamptz,
  open_count integer not null default 0
);

create index if not exists customer_ack_tokens_assessment_idx
  on customer_ack_tokens (assessment_id);

create index if not exists customer_ack_tokens_pending_idx
  on customer_ack_tokens (assessment_id)
  where redeemed_at is null and revoked_at is null;

create index if not exists customer_ack_tokens_expiry_idx
  on customer_ack_tokens (expires_at)
  where redeemed_at is null and revoked_at is null;

-- audit_signoffs extensions
alter table audit_signoffs add column if not exists signoff_type text not null default 'auditor';
alter table audit_signoffs add column if not exists signer_email text;
alter table audit_signoffs add column if not exists signer_ip text;
alter table audit_signoffs add column if not exists signer_user_agent text;
alter table audit_signoffs add column if not exists token_id uuid references customer_ack_tokens(id);
alter table audit_signoffs add column if not exists comment text;
alter table audit_signoffs add column if not exists report_version integer;

create index if not exists audit_signoffs_type_idx
  on audit_signoffs (assessment_id, signoff_type);

-- Closure flags on assessments
alter table assessments add column if not exists closure_flags jsonb not null default '[]'::jsonb;
