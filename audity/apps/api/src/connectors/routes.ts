import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Worker } from "bullmq";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { connectorQueue } from "../jobs/queue.js";
import { decryptText, encryptText } from "../utils/crypto.js";
import { validateBody } from "../utils/validation.js";

const connectorIds = [
  "jira",
  "microsoft-teams",
  "servicenow",
  "sharepoint-onedrive",
  "microsoft-entra-id",
  "power-bi",
  "confluence",
  "slack"
] as const;

type ConnectorId = (typeof connectorIds)[number];
type ConnectorRow = {
  id: ConnectorId;
  provider: string;
  display_name: string;
  enabled: boolean;
  config: Record<string, string>;
  secrets: Record<string, string>;
  status: string;
  last_checked_at: string | null;
  last_message: string | null;
  last_result: Record<string, unknown> | null;
  updated_at: string;
};

type CustomerSyncBundle = {
  generatedAt: string;
  settings: {
    includeCustomers: boolean;
    includeAssessments: boolean;
    includeRisks: boolean;
    includeFindings: boolean;
  };
  customers: Array<Record<string, unknown> & {
    assessments: Array<Record<string, unknown> & {
      risks?: Record<string, unknown>[];
      findings?: Record<string, unknown>[];
    }>;
  }>;
};

const connectorCatalog: Record<ConnectorId, {
  provider: string;
  displayName: string;
  requiredConfig: string[];
  secretFields: string[];
  whatWorks: string;
  comingNext: string;
}> = {
  jira: {
    provider: "Jira",
    displayName: "Jira",
    requiredConfig: ["baseUrl", "projectKey"],
    secretFields: ["apiToken"],
    whatWorks: "Synchronizes Audity customer and assessment data into Jira as configured system sync issues.",
    comingNext: "Two-way status sync and linking individual risks to existing Jira epics."
  },
  "microsoft-teams": {
    provider: "Microsoft Teams",
    displayName: "Microsoft Teams",
    requiredConfig: [],
    secretFields: ["webhookUrl"],
    whatWorks: "Posts Audity customer sync summaries to an incoming Teams webhook.",
    comingNext: "Adaptive Card approvals and channel selection through Microsoft Graph."
  },
  servicenow: {
    provider: "ServiceNow",
    displayName: "ServiceNow",
    requiredConfig: ["instanceUrl", "table"],
    secretFields: ["username", "password"],
    whatWorks: "Creates system sync records in a selected ServiceNow table, for example task or a GRC table.",
    comingNext: "CMDB lookups, assignment-group mapping, and bidirectional ticket updates."
  },
  "sharepoint-onedrive": {
    provider: "SharePoint / OneDrive",
    displayName: "SharePoint / OneDrive",
    requiredConfig: ["driveId"],
    secretFields: ["accessToken"],
    whatWorks: "Uploads Audity customer sync JSON into a configured SharePoint or OneDrive drive through Microsoft Graph.",
    comingNext: "OAuth app consent flow, PDF upload, folder picker, and retention labels."
  },
  "microsoft-entra-id": {
    provider: "Microsoft Entra ID",
    displayName: "Microsoft Entra ID",
    requiredConfig: [],
    secretFields: ["accessToken"],
    whatWorks: "Uses Microsoft Graph access for identity governance checks alongside Audity customer sync metadata.",
    comingNext: "User provisioning, role mapping, SCIM, and conditional-access evidence import."
  },
  "power-bi": {
    provider: "Power BI",
    displayName: "Power BI",
    requiredConfig: ["workspaceId"],
    secretFields: ["accessToken"],
    whatWorks: "Creates or uses a push dataset and sends customer and assessment metrics rows to Power BI.",
    comingNext: "Dashboard templates, scheduled refresh, and risk trend datasets."
  },
  confluence: {
    provider: "Confluence",
    displayName: "Confluence",
    requiredConfig: ["baseUrl", "spaceKey"],
    secretFields: ["apiToken"],
    whatWorks: "Creates Confluence pages with customer sync summaries, risks, and findings.",
    comingNext: "Page update mode, labels, and parent-page picker."
  },
  slack: {
    provider: "Slack",
    displayName: "Slack",
    requiredConfig: [],
    secretFields: ["webhookUrl"],
    whatWorks: "Posts Audity customer sync summaries to Slack by incoming webhook.",
    comingNext: "Bot-token channel selection, slash commands, and risk approval workflows."
  }
};

const connectorSaveSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.string(), z.string().max(2000)).default({}),
  secrets: z.record(z.string(), z.string().max(8000)).default({})
});

const connectorSyncSchema = z.object({
  monthsBack: z.number().int().min(1).max(120).optional()
});

function isConnectorId(value: string): value is ConnectorId {
  return (connectorIds as readonly string[]).includes(value);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function authHeaders(row: ConnectorRow): HeadersInit {
  const secrets = decryptedSecrets(row);
  if ((row.id === "jira" || row.id === "confluence") && row.config.email && secrets.apiToken) {
    return { Authorization: `Basic ${Buffer.from(`${row.config.email}:${secrets.apiToken}`).toString("base64")}` };
  }
  if (secrets.apiToken) return { Authorization: `Bearer ${secrets.apiToken}` };
  if (secrets.accessToken) return { Authorization: `Bearer ${secrets.accessToken}` };
  if (secrets.username && secrets.password) {
    return { Authorization: `Basic ${Buffer.from(`${secrets.username}:${secrets.password}`).toString("base64")}` };
  }
  return {};
}

function decryptedSecrets(row: ConnectorRow): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row.secrets ?? {}).map(([key, value]) => [key, value ? decryptText(String(value)) : ""])
  );
}

function publicConnector(row: ConnectorRow) {
  const catalog = connectorCatalog[row.id];
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.display_name,
    enabled: row.enabled,
    config: row.config ?? {},
    secretFields: catalog.secretFields,
    hasSecrets: Object.fromEntries(catalog.secretFields.map((field) => [field, Boolean(row.secrets?.[field])])),
    requiredConfig: catalog.requiredConfig,
    whatWorks: catalog.whatWorks,
    comingNext: catalog.comingNext,
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    lastMessage: row.last_message,
    lastResult: row.last_result ?? {},
    updatedAt: row.updated_at
  };
}

async function ensureConnectorsSeeded(): Promise<void> {
  for (const id of connectorIds) {
    const item = connectorCatalog[id];
    await pool.query(
      `insert into connectors (id, provider, display_name)
       values ($1, $2, $3)
       on conflict (id) do update
       set provider = excluded.provider,
           display_name = excluded.display_name`,
      [id, item.provider, item.displayName]
    );
  }
}

async function loadConnector(id: ConnectorId): Promise<ConnectorRow | null> {
  await ensureConnectorsSeeded();
  const result = await pool.query<ConnectorRow>("select * from connectors where id = $1", [id]);
  return result.rows[0] ?? null;
}

function boolConfig(config: Record<string, string>, key: string, defaultValue = true): boolean {
  const value = config[key];
  if (value === undefined || value === "") return defaultValue;
  return value === "true";
}

async function loadCustomerSyncBundle(config: Record<string, string>, monthsBack?: number): Promise<CustomerSyncBundle> {
  const settings = {
    includeCustomers: boolConfig(config, "includeCustomers"),
    includeAssessments: boolConfig(config, "includeAssessments"),
    includeRisks: boolConfig(config, "includeRisks"),
    includeFindings: boolConfig(config, "includeFindings")
  };
  const cutoff = monthsBack ? new Date(Date.now() - monthsBack * 31 * 24 * 60 * 60 * 1000).toISOString() : null;
  const [customers, assessments, risks, findings] = await Promise.all([
    pool.query(
      `select id, name, industry, regulatory_context, critical_systems, business_criticality, status, created_at, updated_at
       from customers
       where archived_at is null
         and ($1::timestamptz is null or updated_at >= $1::timestamptz or created_at >= $1::timestamptz)
       order by updated_at desc`,
      [cutoff]
    ),
    settings.includeAssessments
      ? pool.query(
          `select id, customer_id, type, audience, framework, language, target_date, status, scope, created_at, updated_at
           from assessments
           where $1::timestamptz is null or updated_at >= $1::timestamptz or created_at >= $1::timestamptz
           order by updated_at desc`,
          [cutoff]
        )
      : Promise.resolve({ rows: [] } as { rows: Record<string, unknown>[] }),
    settings.includeRisks
      ? pool.query(
          `select id, assessment_id, title, rating, likelihood, impact, risk_score, owner, status, treatment_option, due_date, acceptance_expires_at
           from risks
           where status <> 'deleted'
             and ($1::timestamptz is null or updated_at >= $1::timestamptz or created_at >= $1::timestamptz)
           order by risk_score desc nulls last, updated_at desc`
          ,
          [cutoff]
        )
      : Promise.resolve({ rows: [] } as { rows: Record<string, unknown>[] }),
    settings.includeFindings
      ? pool.query(
          `select id, assessment_id, title, status, priority, source_explanation, created_at, updated_at
           from findings
           where $1::timestamptz is null or updated_at >= $1::timestamptz or created_at >= $1::timestamptz
           order by updated_at desc`
          ,
          [cutoff]
        )
      : Promise.resolve({ rows: [] } as { rows: Record<string, unknown>[] })
  ]);
  const risksByAssessment = new Map<string, Record<string, unknown>[]>();
  for (const risk of risks.rows) {
    const key = String(risk.assessment_id);
    risksByAssessment.set(key, [...(risksByAssessment.get(key) ?? []), risk]);
  }
  const findingsByAssessment = new Map<string, Record<string, unknown>[]>();
  for (const finding of findings.rows) {
    const key = String(finding.assessment_id);
    findingsByAssessment.set(key, [...(findingsByAssessment.get(key) ?? []), finding]);
  }
  const assessmentsByCustomer = new Map<string, Array<Record<string, unknown> & { risks?: Record<string, unknown>[]; findings?: Record<string, unknown>[] }>>();
  for (const assessment of assessments.rows) {
    const id = String(assessment.id);
    const item = {
      ...assessment,
      risks: settings.includeRisks ? risksByAssessment.get(id) ?? [] : undefined,
      findings: settings.includeFindings ? findingsByAssessment.get(id) ?? [] : undefined
    };
    const key = String(assessment.customer_id);
    assessmentsByCustomer.set(key, [...(assessmentsByCustomer.get(key) ?? []), item]);
  }
  return {
    generatedAt: new Date().toISOString(),
    settings,
    customers: settings.includeCustomers
      ? customers.rows.map((customer) => ({
          ...customer,
          assessments: assessmentsByCustomer.get(String(customer.id)) ?? []
        }))
      : []
  };
}

function syncText(bundle: CustomerSyncBundle): string {
  const assessmentCount = bundle.customers.reduce((sum, customer) => sum + customer.assessments.length, 0);
  const riskCount = bundle.customers.reduce((sum, customer) => sum + customer.assessments.reduce((inner, assessment) => inner + (assessment.risks?.length ?? 0), 0), 0);
  const findingCount = bundle.customers.reduce((sum, customer) => sum + customer.assessments.reduce((inner, assessment) => inner + (assessment.findings?.length ?? 0), 0), 0);
  const customerLines = bundle.customers.slice(0, 12).map((customer) => {
    const assessments = customer.assessments.length;
    const risks = customer.assessments.reduce((sum, assessment) => sum + (assessment.risks?.length ?? 0), 0);
    const findings = customer.assessments.reduce((sum, assessment) => sum + (assessment.findings?.length ?? 0), 0);
    return `- ${customer.name}: ${assessments} assessments, ${risks} risks, ${findings} findings`;
  });
  return [
    "Audity system customer sync",
    `Generated: ${bundle.generatedAt}`,
    `Customers: ${bundle.customers.length}`,
    `Assessments: ${assessmentCount}`,
    `Risks: ${riskCount}`,
    `Findings: ${findingCount}`,
    "",
    "Customers:",
    customerLines.join("\n") || "- No customers in scope"
  ].join("\n");
}

function syncHtmlPage(bundle: CustomerSyncBundle): string {
  const text = syncText(bundle).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<h1>Audity Customer Sync</h1><pre>${text}</pre>`;
}

async function providerFetch(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json") ? await response.json().catch(() => null) : await response.text().catch(() => "");
  if (!response.ok) {
    const message = typeof payload === "string" ? payload.slice(0, 300) : JSON.stringify(payload).slice(0, 300);
    throw new Error(`Provider returned ${response.status}: ${message}`);
  }
  return { status: response.status, payload };
}

async function testConnector(row: ConnectorRow) {
  const secrets = decryptedSecrets(row);
  if (row.id === "jira") {
    return providerFetch(`${normalizeBaseUrl(row.config.baseUrl)}/rest/api/3/myself`, { headers: authHeaders(row) });
  }
  if (row.id === "microsoft-teams") {
    return providerFetch(secrets.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Audity connector test successful." })
    });
  }
  if (row.id === "servicenow") {
    return providerFetch(`${normalizeBaseUrl(row.config.instanceUrl)}/api/now/table/sys_user?sysparm_limit=1`, { headers: { ...authHeaders(row), Accept: "application/json" } });
  }
  if (row.id === "sharepoint-onedrive") {
    const driveId = encodeURIComponent(row.config.driveId);
    return providerFetch(`https://graph.microsoft.com/v1.0/drives/${driveId}`, { headers: authHeaders(row) });
  }
  if (row.id === "microsoft-entra-id") {
    return providerFetch("https://graph.microsoft.com/v1.0/users?$top=5&$select=id,displayName,userPrincipalName", { headers: authHeaders(row) });
  }
  if (row.id === "power-bi") {
    return providerFetch(`https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(row.config.workspaceId)}/datasets`, { headers: authHeaders(row) });
  }
  if (row.id === "confluence") {
    return providerFetch(`${normalizeBaseUrl(row.config.baseUrl)}/wiki/rest/api/user/current`, { headers: authHeaders(row) });
  }
  return providerFetch(secrets.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Audity connector test successful." })
  });
}

async function syncCustomers(row: ConnectorRow, bundle: CustomerSyncBundle) {
  const secrets = decryptedSecrets(row);
  const summary = `Audity customer sync - ${bundle.customers.length} customers`;
  const text = syncText(bundle);
  if (row.id === "jira") {
    return providerFetch(`${normalizeBaseUrl(row.config.baseUrl)}/rest/api/3/issue`, {
      method: "POST",
      headers: { ...authHeaders(row), "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          project: { key: row.config.projectKey },
          issuetype: { name: row.config.issueType || "Task" },
          summary,
          description: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text }] }]
          }
        }
      })
    });
  }
  if (row.id === "microsoft-teams") {
    return providerFetch(secrets.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: summary, text })
    });
  }
  if (row.id === "servicenow") {
    const table = encodeURIComponent(row.config.table || "task");
    return providerFetch(`${normalizeBaseUrl(row.config.instanceUrl)}/api/now/table/${table}`, {
      method: "POST",
      headers: { ...authHeaders(row), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        short_description: summary,
        description: text,
        urgency: "3",
        impact: "3"
      })
    });
  }
  if (row.id === "sharepoint-onedrive") {
    const folder = (row.config.folderPath || "Audity").replace(/^\/+|\/+$/g, "");
    const name = row.config.syncFileName || "audity-customer-sync.json";
    const path = encodeURIComponent(folder ? `${folder}/${name}` : name).replace(/%2F/g, "/");
    return providerFetch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(row.config.driveId)}/root:/${path}:/content`, {
      method: "PUT",
      headers: { ...authHeaders(row), "Content-Type": "application/json" },
      body: JSON.stringify(bundle, null, 2)
    });
  }
  if (row.id === "microsoft-entra-id") {
    return providerFetch("https://graph.microsoft.com/v1.0/groups?$top=5&$select=id,displayName", { headers: authHeaders(row) });
  }
  if (row.id === "power-bi") {
    const datasetId = row.config.datasetId;
    const rows = bundle.customers.flatMap((customer) =>
      customer.assessments.length
        ? customer.assessments.map((assessment) => ({
            customerId: customer.id,
            customer: customer.name,
            assessmentId: assessment.id,
            assessmentType: assessment.type,
            risks: assessment.risks?.length ?? 0,
            findings: assessment.findings?.length ?? 0,
            syncedAt: bundle.generatedAt
          }))
        : [{
            customerId: customer.id,
            customer: customer.name,
            assessmentId: "",
            assessmentType: "",
            risks: 0,
            findings: 0,
            syncedAt: bundle.generatedAt
          }]
    );
    if (datasetId) {
      return providerFetch(`https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(row.config.workspaceId)}/datasets/${encodeURIComponent(datasetId)}/tables/CustomerSyncRows/rows`, {
        method: "POST",
        headers: { ...authHeaders(row), "Content-Type": "application/json" },
        body: JSON.stringify({ rows })
      });
    }
    return providerFetch(`https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(row.config.workspaceId)}/datasets`, {
      method: "POST",
      headers: { ...authHeaders(row), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: row.config.datasetName || "Audity Customer Sync",
        defaultMode: "Push",
        tables: [{
          name: "CustomerSyncRows",
          columns: [
            { name: "customerId", dataType: "string" },
            { name: "customer", dataType: "string" },
            { name: "assessmentId", dataType: "string" },
            { name: "assessmentType", dataType: "string" },
            { name: "risks", dataType: "Int64" },
            { name: "findings", dataType: "Int64" },
            { name: "syncedAt", dataType: "DateTime" }
          ]
        }]
      })
    });
  }
  if (row.id === "confluence") {
    return providerFetch(`${normalizeBaseUrl(row.config.baseUrl)}/wiki/rest/api/content`, {
      method: "POST",
      headers: { ...authHeaders(row), "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "page",
        title: summary,
        ancestors: row.config.parentPageId ? [{ id: row.config.parentPageId }] : undefined,
        space: { key: row.config.spaceKey },
        body: { storage: { value: syncHtmlPage(bundle), representation: "storage" } }
      })
    });
  }
  return providerFetch(secrets.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `*${summary}*\n${text}` })
  });
}

async function runConnectorSync(row: ConnectorRow, userId: string | null, monthsBack?: number) {
  const bundle = await loadCustomerSyncBundle(row.config, monthsBack);
  const result = await syncCustomers(row, bundle);
  await updateConnectorStatus(row.id, "ok", `Sync succeeded (${result.status})`, {
    status: result.status,
    customers: bundle.customers.length,
    generatedAt: bundle.generatedAt,
    monthsBack: monthsBack ?? null
  });
  await logRun(row.id, monthsBack ? "initial-sync" : "sync", "ok", "Sync succeeded", userId ?? undefined, {
    status: result.status,
    customers: bundle.customers.length,
    monthsBack: monthsBack ?? null
  });
  return { result, bundle };
}

export function startConnectorSyncWorker(log: { info: (obj: unknown, message?: string) => void; error: (obj: unknown, message?: string) => void }): void {
  const config = loadConfig();
  new Worker(
    "audity-connector-sync",
    async (job) => {
      const rows = await pool.query<ConnectorRow>("select * from connectors where enabled = true order by display_name");
      const results = [];
      for (const row of rows.rows) {
        try {
          const sync = await runConnectorSync(row, null);
          results.push({ connectorId: row.id, status: sync.result.status, customers: sync.bundle.customers.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Auto sync failed";
          await updateConnectorStatus(row.id, "error", message, {});
          await logRun(row.id, "auto-sync", "error", message);
          log.error({ err, connectorId: row.id, jobId: job.id }, "Connector auto sync failed");
        }
      }
      log.info({ jobId: job.id, results }, "Connector auto sync completed");
      return { results };
    },
    { connection: { url: config.redisUrl } }
  );
  void connectorQueue.getJob("connector-auto-sync").catch(() => null);
}

async function logRun(connectorId: ConnectorId, action: string, status: string, message: string, userId?: string, responseSummary: Record<string, unknown> = {}) {
  await pool.query(
    `insert into connector_runs (id, connector_id, action, status, message, created_by, response_summary)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), connectorId, action, status, message, userId ?? null, responseSummary]
  );
}

async function updateConnectorStatus(id: ConnectorId, status: string, message: string, result: Record<string, unknown>) {
  await pool.query(
    `update connectors
     set status = $2,
         last_checked_at = now(),
         last_message = $3,
         last_result = $4,
         updated_at = now()
     where id = $1`,
    [id, status, message, result]
  );
}

export async function registerConnectorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/connectors", { preHandler: requirePermission("connectors.manage") }, async () => {
    await ensureConnectorsSeeded();
    const result = await pool.query<ConnectorRow>("select * from connectors order by display_name");
    const runs = await pool.query(
      `select distinct on (connector_id) connector_id, action, status, message, created_at
       from connector_runs
       order by connector_id, created_at desc`
    );
    const lastRuns = new Map(runs.rows.map((row) => [row.connector_id, row]));
    return { connectors: result.rows.map((row) => ({ ...publicConnector(row), lastRun: lastRuns.get(row.id) ?? null })) };
  });

  app.put<{ Params: { id: string }; Body: z.infer<typeof connectorSaveSchema> }>(
    "/api/admin/connectors/:id",
    { preHandler: requireCsrfPermission("connectors.manage") },
    async (request, reply) => {
      if (!isConnectorId(request.params.id)) {
        return reply.code(404).send({ code: "CONNECTOR_NOT_FOUND", message: "Connector not found" });
      }
      const body = validateBody(connectorSaveSchema, request.body, reply);
      if (!body) return;
      const current = await loadConnector(request.params.id);
      if (!current) return reply.code(404).send({ code: "CONNECTOR_NOT_FOUND", message: "Connector not found" });
      const secrets = { ...(current.secrets ?? {}) };
      for (const field of connectorCatalog[request.params.id].secretFields) {
        const value = body.secrets[field]?.trim();
        if (value) secrets[field] = encryptText(value);
      }
      const result = await pool.query<ConnectorRow>(
        `update connectors
         set enabled = $2,
             config = $3,
             secrets = $4,
             status = case when $2 then status else 'disabled' end,
             updated_at = now()
         where id = $1
         returning *`,
        [request.params.id, body.enabled, body.config, secrets]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "connector.saved",
        entityType: "connector",
        entityId: request.params.id,
        before: publicConnector(current),
        after: publicConnector(result.rows[0])
      });
      return { connector: publicConnector(result.rows[0]) };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/connectors/:id/test",
    { preHandler: requireCsrfPermission("connectors.manage") },
    async (request, reply) => {
      if (!isConnectorId(request.params.id)) {
        return reply.code(404).send({ code: "CONNECTOR_NOT_FOUND", message: "Connector not found" });
      }
      const row = await loadConnector(request.params.id);
      if (!row?.enabled) return reply.code(400).send({ code: "CONNECTOR_DISABLED", message: "Connector is disabled" });
      try {
        const result = await testConnector(row);
        await updateConnectorStatus(request.params.id, "ok", `Connection test succeeded (${result.status})`, { status: result.status });
        await logRun(request.params.id, "test", "ok", "Connection test succeeded", request.user!.sub, { status: result.status });
        return { ok: true, status: result.status, message: "Connection test succeeded" };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection test failed";
        await updateConnectorStatus(request.params.id, "error", message, {});
        await logRun(request.params.id, "test", "error", message, request.user!.sub);
        return reply.code(502).send({ code: "CONNECTOR_TEST_FAILED", message });
      }
    }
  );

  app.post<{ Params: { id: string }; Body: z.infer<typeof connectorSyncSchema> }>(
    "/api/admin/connectors/:id/sync",
    { preHandler: requireCsrfPermission("connectors.manage") },
    async (request, reply) => {
      if (!isConnectorId(request.params.id)) {
        return reply.code(404).send({ code: "CONNECTOR_NOT_FOUND", message: "Connector not found" });
      }
      const body = validateBody(connectorSyncSchema, request.body ?? {}, reply);
      if (!body) return;
      const row = await loadConnector(request.params.id);
      if (!row?.enabled) return reply.code(400).send({ code: "CONNECTOR_DISABLED", message: "Connector is disabled" });
      try {
        const { result, bundle } = await runConnectorSync(row, request.user!.sub, body.monthsBack);
        await appendActivityEvent({
          userId: request.user!.sub,
          action: "connector.synced",
          entityType: "connector",
          entityId: request.params.id,
          before: null,
          after: { customers: bundle.customers.length, status: result.status, monthsBack: body.monthsBack ?? null }
        });
        return { ok: true, status: result.status, message: "Sync succeeded", customers: bundle.customers.length };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Sync failed";
        await updateConnectorStatus(request.params.id, "error", message, {});
        await logRun(request.params.id, "sync", "error", message, request.user!.sub);
        return reply.code(502).send({ code: "CONNECTOR_SYNC_FAILED", message });
      }
    }
  );
}
