-- 002_cockpit_schema.sql
-- Adds notification preferences, cockpit-supporting indexes, and onboarding-state tracking.
-- Idempotent (safe to re-run).

create table if not exists user_notification_prefs (
  user_id uuid primary key references users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  digest_enabled boolean not null default false,
  digest_hour_local integer not null default 6,
  digest_timezone text not null default 'Europe/Berlin',
  last_digest_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_notification_prefs_digest_idx
  on user_notification_prefs (digest_enabled, digest_hour_local);

-- Cockpit aggregation hot paths
create index if not exists assessments_customer_status_idx
  on assessments (customer_id, status, archived_at);

create index if not exists assessments_customer_updated_idx
  on assessments (customer_id, updated_at desc);

create index if not exists notifications_recipient_customer_idx
  on notifications (recipient_user_id, customer_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on notifications (recipient_user_id, read_at)
  where read_at is null;

create index if not exists audit_control_profiles_review_idx
  on audit_control_profiles (assessment_id, review_status)
  where review_status in ('draft', 'ready_for_review', 'changes_requested');

create index if not exists findings_assessment_status_idx
  on findings (assessment_id, status);

create index if not exists audit_evidence_requests_due_idx
  on audit_evidence_requests (assessment_id, status, due_date)
  where status in ('open', 'requested');

-- Onboarding wizard state per (user, customer)
create table if not exists customer_onboarding_state (
  user_id uuid not null references users(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  dismissed boolean not null default false,
  dismissed_at timestamptz,
  primary key (user_id, customer_id)
);
