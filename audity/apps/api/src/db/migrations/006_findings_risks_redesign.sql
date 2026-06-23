-- 006_findings_risks_redesign.sql
-- n:m link between findings and risks, absolute roadmap phase dates,
-- assessment-level auto-convert flag.
-- Idempotent.

-- n:m link table: a risk can group multiple findings, and a finding can support multiple risks.
create table if not exists risk_finding_links (
  risk_id uuid not null references risks(id) on delete cascade,
  finding_id uuid not null references findings(id) on delete cascade,
  created_at timestamptz not null default now(),
  contribution_note text,
  primary key (risk_id, finding_id)
);

create index if not exists risk_finding_links_finding_idx
  on risk_finding_links (finding_id);

-- Backfill: copy existing single-FK relationships into the link table.
insert into risk_finding_links (risk_id, finding_id, created_at)
  select id, finding_id, created_at
    from risks
   where finding_id is not null
on conflict do nothing;

-- The risks.finding_id column stays in place for now as a deprecated legacy
-- pointer. Code reads from risk_finding_links going forward.

-- Roadmap absolute phase boundaries (computed at item creation from closure date).
alter table roadmap_items
  add column if not exists phase_start_date date;
alter table roadmap_items
  add column if not exists phase_end_date date;

-- Assessment-level "auto-convert approved findings to risks" toggle.
-- Stored on the assessment row (not the template) so it can be overridden per audit.
alter table assessments
  add column if not exists auto_convert_findings_to_risks boolean not null default false;

-- Template-level default. Picked up when a new audit is created from a template.
alter table assessment_templates
  add column if not exists default_auto_convert_findings_to_risks boolean not null default false;

create index if not exists roadmap_items_phase_dates_idx
  on roadmap_items (assessment_id, phase_start_date, phase_end_date);
