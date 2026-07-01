-- Lizenzmodell (Free/Pro/Enterprise/Demo). Siehe lizenz_plan.md.
--
-- Das signierte Lizenz-Token selbst sowie der Clock-Schutz-Zeitstempel werden in
-- der bestehenden `settings`-Tabelle gehalten (Keys: 'license_token',
-- 'license_last_validated_at', 'demo_seeded') — dafür ist keine Migration nötig,
-- die Zeilen legt der LicenseService bei Bedarf an.
--
-- Diese Migration markiert nur die Demo-Seed-Daten, damit sie sauber und
-- vollständig zurückgesetzt werden können (Demo-Reset).

alter table customers add column if not exists is_demo boolean not null default false;

create index if not exists customers_is_demo_idx on customers (is_demo) where is_demo;
