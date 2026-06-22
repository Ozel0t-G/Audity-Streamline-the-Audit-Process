-- 003_thresholds_pagination.sql
-- Adds per-audit + per-framework stuck thresholds, deprecates customer-level frameworks,
-- and supports inbox cursor pagination.
-- Idempotent.

alter table assessments
  add column if not exists stuck_thresholds jsonb;

alter table frameworks
  add column if not exists default_stuck_thresholds jsonb;

alter table customer_frameworks
  add column if not exists role text not null default 'audit_suggestion';

alter table customer_frameworks
  add column if not exists deprecated_at timestamptz;

-- Mark existing customer_frameworks entries as the legacy "audit_suggestion" role.
-- (Idempotent: only the first run actually changes rows.)
update customer_frameworks
   set role = 'audit_suggestion'
 where role is null;

-- Index supporting cursor pagination of inbox: composite stable sort key
-- (assessments touched recently across customers a user can access)
create index if not exists assessments_active_updated_idx
  on assessments (status, updated_at desc)
  where archived_at is null and status in ('active', 'imported');

-- Index supporting framework lookup in admin threshold UI
create index if not exists frameworks_default_stuck_idx
  on frameworks ((default_stuck_thresholds is not null));
