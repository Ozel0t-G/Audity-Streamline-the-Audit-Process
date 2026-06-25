-- Mandatory, non-disableable 24h archival of audit_logs and user_activity_logs.
--
-- log_archive_settings is a singleton (id = 'default'). It deliberately has NO
-- "enabled" flag: the archival scheduler is wired unconditionally into the API
-- boot sequence, so neither a user nor an admin can switch it off. Admins may
-- only change WHERE the archive is written (local WORM dir / NAS / drive).
--
-- log_archive_runs is an append-only audit trail of every archival run, using
-- the same prevent_append_only_change() trigger as audit_logs.

create table if not exists log_archive_settings (
  id text primary key default 'default',
  destination_type text not null default 'local',
  destination_config jsonb not null default '{}'::jsonb,
  last_archived_at timestamptz,
  last_audit_log_id uuid,
  last_audit_log_at timestamptz,
  last_activity_log_id uuid,
  last_activity_log_at timestamptz,
  last_bundle_checksum text,
  updated_by_user_id uuid references users(id),
  updated_at timestamptz not null default now()
);

-- destination_type ∈ {local, sftp, s3, ftp}. destination_config holds host/port/
-- path/bucket/username; secret fields (password, secretKey) are stored encrypted
-- (utils/crypto encryptText), never in plaintext.
alter table log_archive_settings add column if not exists destination_type text not null default 'local';
alter table log_archive_settings add column if not exists destination_config jsonb not null default '{}'::jsonb;
alter table log_archive_settings add column if not exists last_archived_at timestamptz;
alter table log_archive_settings add column if not exists last_audit_log_id uuid;
alter table log_archive_settings add column if not exists last_audit_log_at timestamptz;
alter table log_archive_settings add column if not exists last_activity_log_id uuid;
alter table log_archive_settings add column if not exists last_activity_log_at timestamptz;
alter table log_archive_settings add column if not exists last_bundle_checksum text;
alter table log_archive_settings add column if not exists updated_by_user_id uuid references users(id);
alter table log_archive_settings add column if not exists updated_at timestamptz not null default now();

-- Guarantee the singleton row exists with safe defaults (local destination).
insert into log_archive_settings (id, destination_type, destination_config)
values ('default', 'local', '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists log_archive_runs (
  id uuid primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  audit_log_count integer not null default 0,
  activity_log_count integer not null default 0,
  destination_type text,
  destination_uri text,
  bundle_checksum text,
  prev_bundle_checksum text,
  failure_reason text
);

create index if not exists log_archive_runs_started_at_idx
  on log_archive_runs (started_at desc);

-- Append-only: reuse prevent_append_only_change() defined in 001_core_schema.sql.
-- A run row is written exactly once, at completion, with an already-terminal
-- status ('success' or 'failed'). There is no intermediate 'running' UPDATE —
-- overlapping runs are prevented by a pg advisory lock in the service, not a row.
drop trigger if exists log_archive_runs_append_only on log_archive_runs;
create trigger log_archive_runs_append_only
before update or delete on log_archive_runs
for each row execute function prevent_append_only_change();
