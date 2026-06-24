-- 008_console_sessions.sql
-- Maintenance-mode server console: per-session audit + transcript record.
-- Idempotent.

create table if not exists console_sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  source_ip text,
  user_agent text,
  -- how the session ended: closed | idle_timeout | max_duration | killed | error
  exit_reason text,
  -- full input+output transcript (text). Kept in DB for tamper-evidence alongside the
  -- hash-chained activity log; large transcripts may be truncated to a cap by the app.
  transcript text,
  byte_count bigint not null default 0
);

create index if not exists console_sessions_user_idx
  on console_sessions (user_id, started_at desc);
