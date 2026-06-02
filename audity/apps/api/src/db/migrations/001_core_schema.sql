create table if not exists roles (
  id uuid primary key,
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key,
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role_id uuid not null references roles(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  refresh_token_hash text not null unique,
  csrf_token_hash text,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mfa_settings (
  id uuid primary key,
  user_id uuid not null unique references users(id) on delete cascade,
  enabled boolean not null default false,
  secret_hash text,
  recovery_codes_hash jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key,
  name text not null,
  industry text,
  regulatory_context text,
  critical_systems jsonb not null default '[]'::jsonb,
  business_criticality text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists frameworks (
  id uuid primary key,
  name text not null,
  version text,
  source_type text,
  license_status text,
  distributed_by_audity boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists assessments (
  id uuid primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null,
  audience text,
  framework_id uuid references frameworks(id),
  language text not null default 'en',
  target_date date,
  status text not null default 'draft',
  scope jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment_frameworks (
  assessment_id uuid not null references assessments(id) on delete cascade,
  framework_id uuid not null references frameworks(id) on delete cascade,
  mode text not null default 'supporting',
  primary key (assessment_id, framework_id)
);

create table if not exists framework_domains (
  id uuid primary key,
  framework_id uuid not null references frameworks(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0
);

create table if not exists framework_controls (
  id uuid primary key,
  framework_domain_id uuid not null references framework_domains(id) on delete cascade,
  control_code text not null,
  title text not null,
  description text,
  sort_order integer not null default 0
);

create table if not exists assessment_questions (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  framework_control_id uuid references framework_controls(id),
  question text not null,
  domain text,
  sort_order integer not null default 0
);

create table if not exists control_mappings (
  id uuid primary key,
  source_control_id uuid not null references framework_controls(id) on delete cascade,
  target_control_id uuid not null references framework_controls(id) on delete cascade,
  mapping_type text not null default 'related'
);

create table if not exists control_answers (
  id uuid primary key,
  assessment_question_id uuid not null references assessment_questions(id) on delete cascade,
  user_id uuid references users(id),
  score integer,
  answer_state text not null default 'unknown',
  evidence_status text not null default 'not_requested',
  confidence_level text not null default 'medium',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists findings (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  title text not null,
  status text not null default 'suggested',
  priority text,
  observation text,
  recommendation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists risks (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  finding_id uuid references findings(id),
  title text not null,
  likelihood integer,
  impact integer,
  risk_score integer,
  rating text,
  treatment_option text,
  owner text,
  treatment_plan text,
  due_date date,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roadmap_items (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  risk_id uuid references risks(id),
  phase text not null,
  action text not null,
  owner text,
  due_date date,
  effort_estimate text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evidence_items (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  uploaded_by uuid references users(id),
  object_key text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists report_templates (
  id uuid primary key,
  name text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  template_id uuid references report_templates(id),
  created_by uuid references users(id),
  status text not null default 'draft',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists report_branding (
  id uuid primary key,
  logo_object_key text,
  primary_color text,
  secondary_color text,
  accent_color text,
  cover_style text,
  header_text text,
  footer_text text,
  confidentiality_label text,
  watermark text,
  updated_at timestamptz not null default now()
);

create table if not exists email_settings (
  id uuid primary key,
  smtp_host text,
  smtp_port integer,
  smtp_tls boolean not null default true,
  smtp_user text,
  smtp_password_encrypted text,
  sender text,
  updated_at timestamptz not null default now()
);

create table if not exists email_delivery_log (
  id uuid primary key,
  sender text not null,
  recipient text not null,
  report_id uuid references reports(id),
  assessment_id uuid references assessments(id),
  encryption_method text,
  smtp_result text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key,
  actor_user_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id text,
  ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists user_activity_logs (
  id uuid primary key,
  user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  prev_hash text,
  event_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists backup_jobs (
  id uuid primary key,
  job_type text not null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table sessions add column if not exists csrf_token_hash text;
alter table sessions add column if not exists last_seen_at timestamptz not null default now();
alter table mfa_settings add column if not exists secret_encrypted text;
alter table mfa_settings add column if not exists verified_at timestamptz;
alter table assessments add column if not exists framework text;
alter table frameworks add column if not exists short_name text;
alter table frameworks add column if not exists status_label text;
alter table frameworks add column if not exists disclaimer text;
alter table frameworks add column if not exists imported_by uuid references users(id);
alter table frameworks add column if not exists imported_at timestamptz;
alter table frameworks add column if not exists license_confirmed boolean not null default false;
alter table framework_domains add column if not exists description text;
alter table framework_controls add column if not exists question_text text;
alter table framework_controls add column if not exists evidence_examples jsonb not null default '[]'::jsonb;
alter table framework_controls add column if not exists tags jsonb not null default '[]'::jsonb;
alter table findings add column if not exists assessment_question_id uuid references assessment_questions(id);
alter table findings add column if not exists framework_control_id uuid references framework_controls(id);
alter table findings add column if not exists source_explanation text;
alter table findings add column if not exists accepted_risk boolean not null default false;
alter table findings add column if not exists updated_by uuid references users(id);
alter table roadmap_items add column if not exists source_risk_rating text;

create unique index if not exists frameworks_name_version_unique
  on frameworks (name, coalesce(version, ''));

create unique index if not exists framework_domains_framework_name_unique
  on framework_domains (framework_id, name);

create unique index if not exists framework_controls_domain_code_unique
  on framework_controls (framework_domain_id, control_code);

create unique index if not exists assessment_questions_assessment_control_unique
  on assessment_questions (assessment_id, framework_control_id)
  where framework_control_id is not null;

create unique index if not exists control_answers_question_unique
  on control_answers (assessment_question_id);

create unique index if not exists findings_assessment_control_unique
  on findings (assessment_id, framework_control_id)
  where framework_control_id is not null;

create or replace function prevent_append_only_change()
returns trigger as $$
begin
  raise exception 'append-only table cannot be modified';
end;
$$ language plpgsql;

drop trigger if exists audit_logs_append_only on audit_logs;
create trigger audit_logs_append_only
before update or delete on audit_logs
for each row execute function prevent_append_only_change();

drop trigger if exists user_activity_logs_append_only on user_activity_logs;
create trigger user_activity_logs_append_only
before update or delete on user_activity_logs
for each row execute function prevent_append_only_change();
