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
  created_by_user_id uuid references users(id),
  industry text,
  regulatory_context text,
  critical_systems jsonb not null default '[]'::jsonb,
  business_criticality text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_shares (
  id uuid primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  shared_with_user_id uuid not null references users(id),
  shared_by_user_id uuid not null references users(id),
  message text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references users(id)
);

create table if not exists notifications (
  id uuid primary key,
  recipient_user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  customer_id uuid references customers(id) on delete cascade,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  read_at timestamptz
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

create table if not exists licensed_framework_imports (
  id uuid primary key,
  tenant_id text,
  framework_family text not null,
  tenant_framework_id text,
  tenant_license_owner text,
  license_status text,
  license_review_date date,
  redistribution_allowed boolean not null default false,
  storage_scope text not null default 'tenant_local_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists customer_frameworks (
  customer_id uuid not null references customers(id) on delete cascade,
  framework_id uuid not null references frameworks(id) on delete cascade,
  selected_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (customer_id, framework_id)
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

create table if not exists framework_evidence_requirements (
  id uuid primary key,
  control_id uuid not null references framework_controls(id) on delete cascade,
  evidence_type text not null,
  required_by_default boolean not null default true,
  freshness_days integer,
  sort_order integer not null default 0
);

create table if not exists question_control_mappings (
  id uuid primary key,
  framework_id uuid not null references frameworks(id) on delete cascade,
  framework_control_id uuid not null references framework_controls(id) on delete cascade,
  question_id text not null,
  question text not null,
  answer_scale text not null default '0,1,2,3,4,NA',
  minimum_evidence_expected integer not null default 1,
  preferred_evidence_types jsonb not null default '[]'::jsonb,
  gap_trigger text,
  sort_order integer not null default 0
);

create table if not exists licensed_framework_mappings (
  id uuid primary key,
  tenant_id text,
  audity_control_id uuid not null references framework_controls(id) on delete cascade,
  tenant_reference_id text,
  tenant_reference_title text,
  tenant_reference_text_local_only text,
  mapping_status text not null default 'empty_until_tenant_imports_licensed_content',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table if not exists email_subscriptions (
  topic text primary key,
  roles jsonb not null default '[]'::jsonb,
  extra_emails jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
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

create table if not exists review_comments (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  user_id uuid references users(id),
  comment text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists connectors (
  id text primary key,
  provider text not null,
  display_name text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  secrets jsonb not null default '{}'::jsonb,
  status text not null default 'not_configured',
  last_checked_at timestamptz,
  last_message text,
  last_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists connector_runs (
  id uuid primary key,
  connector_id text not null references connectors(id) on delete cascade,
  action text not null,
  status text not null,
  message text,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists connector_runs_connector_created_idx
  on connector_runs (connector_id, created_at desc);

create table if not exists system_health_samples (
  id uuid primary key,
  status text not null,
  cpu_percent numeric not null default 0,
  memory_percent numeric not null default 0,
  storage_percent numeric not null default 0,
  server_ip text,
  issues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_health_samples_created_at on system_health_samples(created_at desc);

create table if not exists backup_jobs (
  id uuid primary key,
  job_type text not null,
  status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table backup_jobs add column if not exists source text;
alter table backup_jobs add column if not exists created_by_user_id uuid references users(id);
alter table backup_jobs add column if not exists created_at timestamptz not null default now();
alter table backup_jobs add column if not exists completed_at timestamptz;
alter table backup_jobs add column if not exists failed_at timestamptz;
alter table backup_jobs add column if not exists failure_reason text;
alter table backup_jobs add column if not exists storage_location text;
alter table backup_jobs add column if not exists download_expires_at timestamptz;
alter table backup_jobs add column if not exists is_downloadable_zip boolean not null default false;
alter table backup_jobs add column if not exists backup_manifest jsonb;

create table if not exists backup_settings (
  id text primary key default 'default',
  automatic_backups_enabled boolean not null default false,
  backup_type text not null default 'full',
  include_database boolean not null default true,
  include_evidence_files boolean not null default true,
  include_generated_reports boolean not null default true,
  include_framework_imports boolean not null default true,
  include_audit_logs boolean not null default true,
  include_user_activity_logs boolean not null default true,
  include_system_settings boolean not null default true,
  include_notifications boolean not null default true,
  schedule_mode text not null default 'Daily',
  daily_time text,
  weekly_day text,
  weekly_time text,
  monthly_day integer,
  monthly_time text,
  custom_interval_hours integer,
  retention_keep_last integer not null default 7,
  updated_by_user_id uuid references users(id),
  updated_at timestamptz not null default now()
);

alter table backup_settings add column if not exists automatic_backups_enabled boolean not null default false;
alter table backup_settings add column if not exists backup_type text not null default 'full';
alter table backup_settings add column if not exists include_database boolean not null default true;
alter table backup_settings add column if not exists include_evidence_files boolean not null default true;
alter table backup_settings add column if not exists include_reports boolean not null default true;
alter table backup_settings add column if not exists include_framework_imports boolean not null default true;
alter table backup_settings add column if not exists include_audit_logs boolean not null default true;
alter table backup_settings add column if not exists include_activity_logs boolean not null default true;
alter table backup_settings add column if not exists include_system_settings boolean not null default true;
alter table backup_settings add column if not exists include_notifications boolean not null default true;
alter table backup_settings add column if not exists schedule_timezone text not null default 'Europe/Oslo';
alter table backup_settings add column if not exists schedule_cron text not null default '0 2 * * *';
alter table backup_settings add column if not exists retention_days integer not null default 30;
alter table backup_settings add column if not exists updated_by_user_id uuid references users(id);
alter table backup_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists restore_jobs (
  id uuid primary key,
  backup_job_id uuid references backup_jobs(id),
  uploaded_archive_path text,
  status text not null default 'pending',
  started_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  precheck_result jsonb,
  metadata jsonb not null default '{}'::jsonb,
  safety_backup_job_id uuid
);

alter table restore_jobs drop constraint if exists restore_jobs_safety_backup_job_id_fkey;
alter table restore_jobs add column if not exists safety_backup_job_id uuid;
alter table restore_jobs add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table sessions add column if not exists csrf_token_hash text;
alter table sessions add column if not exists last_seen_at timestamptz not null default now();
alter table users add column if not exists alpha_accepted_at timestamptz;
alter table customers add column if not exists created_by_user_id uuid references users(id);
alter table customers add column if not exists archived_at timestamptz;
alter table mfa_settings add column if not exists secret_encrypted text;
alter table mfa_settings add column if not exists verified_at timestamptz;
alter table assessments add column if not exists framework text;
alter table frameworks add column if not exists delivery_mode text;
alter table frameworks add column if not exists content_class text;
alter table frameworks add column if not exists official_standard_text_included boolean not null default false;
alter table frameworks add column if not exists official_control_catalogue_included boolean not null default false;
alter table frameworks add column if not exists licensed_content_import_supported boolean not null default false;
alter table frameworks add column if not exists redistribution_note text;
alter table frameworks add column if not exists updated_at timestamptz not null default now();
alter table frameworks add column if not exists short_name text;
alter table frameworks add column if not exists status_label text;
alter table frameworks add column if not exists disclaimer text;
alter table frameworks add column if not exists imported_by uuid references users(id);
alter table frameworks add column if not exists imported_at timestamptz;
alter table frameworks add column if not exists license_confirmed boolean not null default false;
alter table frameworks add column if not exists yaml_source_path text;
alter table frameworks add column if not exists yaml_synced_at timestamptz;
alter table frameworks add column if not exists archived_at timestamptz;
alter table frameworks add column if not exists source_kind text not null default 'shipped';
create index if not exists idx_frameworks_archived_at on frameworks(archived_at);
create index if not exists idx_frameworks_source_kind on frameworks(source_kind);

create table if not exists framework_imports (
  id uuid primary key,
  uploaded_by uuid not null references users(id),
  source_filename text not null,
  source_mime text not null,
  source_path text not null,
  status text not null,
  framework_key text,
  framework_name text,
  framework_version text,
  framework_language text default 'en',
  draft_yaml jsonb,
  llm_provider text,
  llm_model text,
  llm_tokens_in int not null default 0,
  llm_tokens_out int not null default 0,
  llm_estimated_cost_cents int not null default 0,
  total_controls int not null default 0,
  enriched_controls int not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  committed_yaml_path text
);
create index if not exists idx_framework_imports_status on framework_imports(status);
create index if not exists idx_framework_imports_uploaded_by on framework_imports(uploaded_by);
alter table framework_domains add column if not exists domain_id text;
alter table framework_domains add column if not exists description text;
alter table framework_controls add column if not exists audity_objective text;
alter table framework_controls add column if not exists default_weight numeric not null default 1.0;
alter table framework_controls add column if not exists readiness_pass_condition text;
alter table framework_controls add column if not exists gap_condition text;
alter table framework_controls add column if not exists criticality_hint text;
alter table framework_controls add column if not exists report_mapping jsonb not null default '{}'::jsonb;
alter table framework_controls add column if not exists question_text text;
alter table framework_controls add column if not exists evidence_examples jsonb not null default '[]'::jsonb;
alter table framework_controls add column if not exists tags jsonb not null default '[]'::jsonb;
alter table assessment_questions add column if not exists question_id text;
alter table assessment_questions add column if not exists answer_scale text;
alter table assessment_questions add column if not exists minimum_evidence_expected integer not null default 1;
alter table assessment_questions add column if not exists preferred_evidence_types jsonb not null default '[]'::jsonb;
alter table assessment_questions add column if not exists gap_trigger text;
alter table findings add column if not exists assessment_question_id uuid references assessment_questions(id);
alter table findings add column if not exists framework_control_id uuid references framework_controls(id);
alter table findings add column if not exists source_explanation text;
alter table findings add column if not exists accepted_risk boolean not null default false;
alter table findings add column if not exists updated_by uuid references users(id);
alter table risks add column if not exists draft boolean not null default false;
alter table risks add column if not exists source_type text not null default 'manual';
alter table risks add column if not exists source_assessment_question_id uuid references assessment_questions(id);
alter table risks add column if not exists source_framework_control_id uuid references framework_controls(id);
alter table risks add column if not exists source_score integer;
alter table risks add column if not exists source_generated_at timestamptz;
alter table risks add column if not exists source_explanation text;
alter table risks add column if not exists acceptance_reason text;
alter table risks add column if not exists accepted_by uuid references users(id);
alter table risks add column if not exists accepted_at timestamptz;
alter table risks add column if not exists acceptance_expires_at date;
alter table roadmap_items add column if not exists source_risk_rating text;
alter table evidence_items add column if not exists deleted_at timestamptz;
alter table reports add column if not exists author_info jsonb not null default '{}'::jsonb;
alter table reports add column if not exists selected_blocks jsonb not null default '[]'::jsonb;
alter table reports add column if not exists html_preview text;
alter table reports add column if not exists pdf_object_key text;
alter table reports add column if not exists exported_at timestamptz;
alter table reports add column if not exists report_version integer not null default 1;
alter table report_branding add column if not exists logo_file_name text;

create unique index if not exists frameworks_name_version_unique
  on frameworks (name, coalesce(version, ''));

create unique index if not exists framework_domains_framework_name_unique
  on framework_domains (framework_id, name);

create unique index if not exists framework_controls_domain_code_unique
  on framework_controls (framework_domain_id, control_code);

drop index if exists assessment_questions_assessment_control_unique;

create unique index if not exists assessment_questions_assessment_question_unique
  on assessment_questions (assessment_id, question_id)
  where question_id is not null;

create unique index if not exists framework_evidence_requirements_control_type_unique
  on framework_evidence_requirements (control_id, evidence_type);

create unique index if not exists question_control_mappings_framework_question_control_unique
  on question_control_mappings (framework_id, question_id, framework_control_id);

create unique index if not exists control_answers_question_unique
  on control_answers (assessment_question_id);

create unique index if not exists findings_assessment_control_unique
  on findings (assessment_id, framework_control_id)
  where framework_control_id is not null;

create unique index if not exists customer_shares_active_unique
  on customer_shares (customer_id, shared_with_user_id)
  where revoked_at is null;

create index if not exists notifications_recipient_created_idx
  on notifications (recipient_user_id, read_at, created_at desc);

create table if not exists workbench_records (
  id uuid primary key,
  kind text not null,
  title text not null,
  description text not null default '',
  status text not null default 'open',
  priority text not null default 'medium',
  owner text,
  customer_id uuid references customers(id) on delete set null,
  assessment_id uuid references assessments(id) on delete set null,
  due_date date,
  visibility text not null default 'internal',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workbench_records_kind_status_idx
  on workbench_records (kind, status, updated_at desc);

create index if not exists workbench_records_customer_idx
  on workbench_records (customer_id, kind, updated_at desc);

create table if not exists saved_views (
  id uuid primary key,
  name text not null,
  scope text not null,
  filters jsonb not null default '{}'::jsonb,
  columns jsonb not null default '[]'::jsonb,
  owner_user_id uuid references users(id) on delete cascade,
  shared boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table saved_views
  alter column shared set default true;

update saved_views
set shared = true
where shared = false;

create table if not exists public_api_tokens (
  id uuid primary key,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes jsonb not null default '[]'::jsonb,
  created_by uuid references users(id),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists webhook_subscriptions (
  id uuid primary key,
  name text not null,
  target_url text not null,
  events jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  secret_hash text,
  last_status text,
  last_message text,
  last_called_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integration_settings (
  key text primary key,
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists assessment_templates (
  id uuid primary key,
  name text not null,
  description text not null default '',
  framework_id uuid references frameworks(id) on delete set null,
  default_audience text,
  default_language text not null default 'en',
  default_due_days integer not null default 30,
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recurring_assessments (
  id uuid primary key,
  customer_id uuid references customers(id) on delete cascade,
  template_id uuid references assessment_templates(id) on delete set null,
  name text not null,
  cadence text not null default 'quarterly',
  next_run_date date,
  enabled boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_gates (
  id uuid primary key,
  name text not null,
  entity_type text not null,
  required_role text,
  required_approvals integer not null default 1,
  enabled boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists custom_fields (
  id uuid primary key,
  entity_type text not null,
  field_key text not null,
  label text not null,
  field_type text not null default 'text',
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, field_key)
);

create table if not exists custom_status_workflows (
  id uuid primary key,
  entity_type text not null,
  name text not null,
  statuses jsonb not null default '[]'::jsonb,
  default_status text,
  enabled boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists retention_policies (
  id uuid primary key,
  name text not null,
  entity_type text not null,
  retention_days integer not null default 365,
  legal_hold_exempt boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists legal_holds (
  id uuid primary key,
  customer_id uuid references customers(id) on delete cascade,
  assessment_id uuid references assessments(id) on delete cascade,
  reason text not null,
  status text not null default 'active',
  approved_by text,
  expires_at date,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_program_templates (
  id uuid primary key,
  name text not null,
  description text not null default '',
  program_type text not null default 'internal_security_audit',
  phases jsonb not null default '[]'::jsonb,
  default_scope jsonb not null default '{}'::jsonb,
  default_controls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_plans (
  assessment_id uuid primary key references assessments(id) on delete cascade,
  program_template_id uuid references audit_program_templates(id) on delete set null,
  current_phase text not null default 'Preparation',
  phases jsonb not null default '[]'::jsonb,
  kickoff_at timestamptz,
  fieldwork_start date,
  fieldwork_end date,
  report_due_date date,
  closure_due_date date,
  audit_owner text,
  reviewer text,
  readiness_target integer not null default 85,
  created_by uuid references users(id),
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_scope_items (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  item_type text not null,
  name text not null,
  description text not null default '',
  in_scope boolean not null default true,
  criticality text not null default 'medium',
  rationale text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audit_scope_items_assessment_idx
  on audit_scope_items (assessment_id, item_type, in_scope);

create table if not exists audit_control_profiles (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  assessment_question_id uuid references assessment_questions(id) on delete cascade,
  framework_control_id uuid references framework_controls(id) on delete set null,
  applicability text not null default 'applicable',
  applicability_reason text,
  control_owner text,
  reviewer text,
  review_status text not null default 'draft',
  control_criticality text not null default 'medium',
  maturity_justification text,
  evidence_quality_score integer not null default 0,
  readiness_status text not null default 'not_ready',
  signoff_status text not null default 'not_signed',
  signoff_by uuid references users(id),
  signoff_at timestamptz,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, assessment_question_id)
);

create index if not exists audit_control_profiles_assessment_idx
  on audit_control_profiles (assessment_id, review_status, readiness_status);

create table if not exists audit_evidence_mappings (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  evidence_id uuid not null references evidence_items(id) on delete cascade,
  assessment_question_id uuid references assessment_questions(id) on delete cascade,
  finding_id uuid references findings(id) on delete cascade,
  risk_id uuid references risks(id) on delete cascade,
  mapping_type text not null default 'supports_control',
  quality_relevance integer not null default 3,
  quality_completeness integer not null default 3,
  quality_freshness integer not null default 3,
  quality_trust integer not null default 3,
  quality_score integer not null default 3,
  status text not null default 'mapped',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audit_evidence_mappings_assessment_idx
  on audit_evidence_mappings (assessment_id, assessment_question_id, evidence_id);

create table if not exists audit_evidence_requests (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  assessment_question_id uuid references assessment_questions(id) on delete cascade,
  title text not null,
  description text not null default '',
  owner text,
  due_date date,
  status text not null default 'open',
  portal_visibility text not null default 'customer',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audit_evidence_requests_assessment_idx
  on audit_evidence_requests (assessment_id, status, due_date);

create table if not exists audit_interviews (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  title text not null,
  participants text not null default '',
  interview_at timestamptz,
  notes text not null default '',
  linked_question_id uuid references assessment_questions(id) on delete set null,
  follow_up text,
  status text not null default 'planned',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_samples (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  name text not null,
  population_description text not null default '',
  population_size integer not null default 0,
  sample_size integer not null default 0,
  selection_method text not null default 'judgmental',
  selected_items jsonb not null default '[]'::jsonb,
  result_summary text,
  status text not null default 'planned',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_report_reviews (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  report_id uuid references reports(id) on delete set null,
  status text not null default 'draft',
  reviewer text,
  customer_reviewer text,
  summary text,
  due_date date,
  approved_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_signoffs (
  id uuid primary key,
  assessment_id uuid not null references assessments(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  signoff_status text not null default 'signed',
  signed_by uuid references users(id),
  signer_name text,
  statement text not null default '',
  event_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_signoffs_assessment_entity_idx
  on audit_signoffs (assessment_id, entity_type, entity_id);

alter table findings add column if not exists lifecycle_status text not null default 'draft';
alter table findings add column if not exists severity_impact integer;
alter table findings add column if not exists severity_likelihood integer;
alter table findings add column if not exists control_criticality text;
alter table findings add column if not exists evidence_confidence text;
alter table findings add column if not exists calculated_severity text;
alter table findings add column if not exists management_response_status text;
alter table findings add column if not exists management_response text;
alter table findings add column if not exists management_owner text;
alter table findings add column if not exists remediation_status text not null default 'not_started';
alter table findings add column if not exists remediation_owner text;
alter table findings add column if not exists remediation_due_date date;
alter table findings add column if not exists retest_status text not null default 'not_ready';
alter table findings add column if not exists retest_notes text;
alter table findings add column if not exists retest_evidence_id uuid references evidence_items(id) on delete set null;
alter table findings add column if not exists verified_at timestamptz;
alter table findings add column if not exists verified_by uuid references users(id);

insert into settings (key, value)
values ('session_idle_timeout_minutes', '30'::jsonb)
on conflict (key) do nothing;

update customers
set created_by_user_id = (
  select u.id
  from users u
  join roles r on r.id = u.role_id
  where r.name in ('Instance Admin', 'Tenant Admin')
  order by case when r.name = 'Instance Admin' then 0 else 1 end, u.created_at
  limit 1
)
where created_by_user_id is null
  and exists (
    select 1
    from users u
    join roles r on r.id = u.role_id
    where r.name in ('Instance Admin', 'Tenant Admin')
  );

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

create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  language text not null default 'English',
  theme text not null default 'System',
  notifications_enabled boolean not null default true,
  default_view text not null default 'Dashboard',
  table_density text not null default 'Comfortable',
  export_format text not null default 'CSV',
  tooltips_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- ARCHIVE SYSTEM (Customer archive + monthly ZIP bundles)
-- ============================================================================

alter table customers add column if not exists archived_by uuid references users(id);
alter table customers add column if not exists archive_reason text;
alter table assessments add column if not exists archived_at timestamptz;
alter table assessments add column if not exists archived_by uuid references users(id);
create index if not exists idx_customers_archived_at on customers(archived_at);
create index if not exists idx_assessments_archived_at on assessments(archived_at);

create table if not exists archive_index (
  customer_id      uuid primary key references customers(id),
  archived_at      timestamptz not null,
  archived_by      uuid not null references users(id),
  archive_month    text not null,
  archive_state    text not null,
  spool_path       text,
  bundle_filename  text,
  bundle_checksum  text,
  manifest_json    jsonb not null,
  size_bytes       bigint not null default 0,
  exported_at      timestamptz,
  notes            text
);
create index if not exists idx_archive_index_month on archive_index(archive_month);
create index if not exists idx_archive_index_state on archive_index(archive_state);

create table if not exists archive_restore_requests (
  id              uuid primary key,
  customer_id     uuid not null references customers(id),
  requested_by    uuid not null references users(id),
  reason          text not null,
  status          text not null default 'pending',
  requested_at    timestamptz not null default now(),
  resolved_by     uuid references users(id),
  resolved_at     timestamptz,
  resolution_note text
);
create index if not exists idx_archive_restore_status on archive_restore_requests(status);

-- ============================================================================
-- ENCRYPTION KEY METADATA (BIP-39 recovery phrase fingerprint)
-- ============================================================================

create table if not exists encryption_key_meta (
  id               int primary key default 1,
  fingerprint      text not null,
  setup_at         timestamptz not null default now(),
  acknowledged_at  timestamptz,
  acknowledged_by  uuid references users(id),
  check (id = 1)
);

-- New permissions for archive approval + customer archiving are seeded via apps/api/src/rbac/permissions.ts
