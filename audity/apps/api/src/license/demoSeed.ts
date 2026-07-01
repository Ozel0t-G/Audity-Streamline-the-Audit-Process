import { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";
import { appendAuditEvent } from "../audit/service.js";

// Demo-Seed: drei Muster-Kunden (A fertig / B halbfertig / C fast fertig, viele
// Probleme). Alle Datensätze hängen am Kunden (is_demo=true) → Reset per
// Cascade-Delete. Siehe lizenz_plan.md §9.2/§9.3.
//
// v1 seedet die story-tragenden Tabellen (customers, assessments, findings,
// risks) — diese treiben die Dashboard-Kennzahlen openFindings/criticalRisks und
// erzählen die A/B/C-Geschichte. (Der live berechnete progressPercent braucht die
// volle Framework→control_answers-Kette und kann später angereichert werden.)

const SEEDED_FLAG = "demo_seeded";
let seededThisProcess = false;
let seedingInFlight: Promise<void> | null = null;

type RiskGroup = { rating: string; status: string; count: number };
type Profile = {
  name: string;
  industry: string;
  criticality: string;
  assessmentType: string;
  status: string;
  targetOffsetDays: number;
  findingCount: number;
  findingStatus: string;
  risks: RiskGroup[];
};

const PROFILES: Profile[] = [
  {
    name: "Acme Ltd (Demo — completed audit)",
    industry: "Manufacturing",
    criticality: "high",
    assessmentType: "ISO/IEC 27001:2022",
    status: "completed",
    targetOffsetDays: -30,
    findingCount: 2,
    findingStatus: "dismissed", // erledigt → zählt nicht als offen
    risks: [{ rating: "Low", status: "closed", count: 3 }]
  },
  {
    name: "Globex AG (Demo — audit in progress)",
    industry: "Financial Services",
    criticality: "high",
    assessmentType: "ISO/IEC 27001:2022",
    status: "in_progress",
    targetOffsetDays: 45,
    findingCount: 4,
    findingStatus: "confirmed",
    risks: [
      { rating: "Medium", status: "open", count: 3 },
      { rating: "High", status: "open", count: 2 }
    ]
  },
  {
    name: "Initech (Demo — nearly done, many issues)",
    industry: "Healthcare",
    criticality: "critical",
    assessmentType: "ISO/IEC 27001:2022",
    status: "review",
    targetOffsetDays: 10,
    findingCount: 12,
    findingStatus: "suggested",
    risks: [
      { rating: "Critical", status: "open", count: 6 },
      { rating: "High", status: "open", count: 5 },
      { rating: "Medium", status: "open", count: 4 }
    ]
  }
];

async function isFlagSet(): Promise<boolean> {
  const r = await pool.query<{ value: unknown }>("select value from settings where key = $1", [SEEDED_FLAG]);
  return r.rows[0]?.value === true;
}

async function setFlag(value: boolean): Promise<void> {
  await pool.query(
    `insert into settings (key, value) values ($1, to_jsonb($2::boolean))
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [SEEDED_FLAG, value]
  );
}

async function ownerUserId(): Promise<string | null> {
  const admin = await pool.query<{ id: string }>(
    `select u.id from users u join roles r on r.id = u.role_id
      where r.name = 'Instance Admin' order by u.created_at asc limit 1`
  );
  if (admin.rows[0]) return admin.rows[0].id;
  const any = await pool.query<{ id: string }>("select id from users order by created_at asc limit 1");
  return any.rows[0]?.id ?? null;
}

async function seedProfile(p: Profile, owner: string): Promise<void> {
  const customerId = randomUUID();
  await pool.query(
    `insert into customers (id, name, created_by_user_id, industry, business_criticality, status, is_demo)
     values ($1, $2, $3, $4, $5, 'active', true)`,
    [customerId, p.name, owner, p.industry, p.criticality]
  );

  const assessmentId = randomUUID();
  await pool.query(
    `insert into assessments (id, customer_id, type, status, target_date)
     values ($1, $2, $3, $4, (current_date + ($5 || ' days')::interval)::date)`,
    [assessmentId, customerId, p.assessmentType, p.status, String(p.targetOffsetDays)]
  );

  for (let i = 0; i < p.findingCount; i++) {
    await pool.query(
      `insert into findings (id, assessment_id, title, status, priority, observation, recommendation)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        assessmentId,
        `Demo finding ${i + 1}`,
        p.findingStatus,
        i % 3 === 0 ? "high" : "medium",
        "Sample observation shown in the demo.",
        "Sample recommendation shown in the demo."
      ]
    );
  }

  let n = 1;
  for (const grp of p.risks) {
    const likelihood =
      grp.rating === "Critical" ? 5 : grp.rating === "High" ? 4 : grp.rating === "Medium" ? 3 : 2;
    for (let i = 0; i < grp.count; i++) {
      await pool.query(
        `insert into risks (id, assessment_id, title, likelihood, impact, risk_score, rating, status, owner)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          assessmentId,
          `Demo risk ${n++}`,
          likelihood,
          likelihood,
          likelihood * likelihood,
          grp.rating,
          grp.status,
          "Demo Owner"
        ]
      );
    }
  }
}

async function seedAll(): Promise<{ customers: number }> {
  const owner = await ownerUserId();
  if (!owner) return { customers: 0 };
  for (const p of PROFILES) await seedProfile(p, owner);
  await setFlag(true);
  seededThisProcess = true;
  return { customers: PROFILES.length };
}

/** Idempotent: seedet einmal, sobald ein Admin existiert. Best-effort. */
export async function ensureDemoSeeded(): Promise<void> {
  if (seededThisProcess) return;
  // In-flight lock: concurrent triggers (boot + lazy state fetch, multiple tabs)
  // must not both pass the flag check and seed twice in this process.
  if (seedingInFlight) return seedingInFlight;
  seedingInFlight = (async () => {
    try {
      if (await isFlagSet()) {
        seededThisProcess = true;
        return;
      }
      await seedAll();
    } catch {
      /* best-effort — retry on the next trigger */
    } finally {
      seedingInFlight = null;
    }
  })();
  return seedingInFlight;
}

/** Demo-Daten löschen (Cascade über is_demo-Kunden) und neu seeden. */
export async function reseedDemo(actorUserId: string): Promise<{ customers: number }> {
  await pool.query("delete from customers where is_demo = true");
  seededThisProcess = false;
  await setFlag(false);
  const result = await seedAll();
  await appendAuditEvent({
    actor: actorUserId,
    action: "demo.reseeded",
    entity: "customers",
    entityId: "demo",
    payload: result
  }).catch(() => undefined);
  return result;
}
