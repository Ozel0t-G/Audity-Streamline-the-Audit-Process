import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { pool } from "../db/client.js";
import { loadConfig } from "../config.js";
import { appendAuditEvent } from "../audit/service.js";
import { appendActivityEvent } from "../activity/service.js";
import { publishEmailTopic } from "../notifications/emailTopics.js";
import { isUuid } from "../utils/validation.js";
import { moveCustomerArtifactsToSpool, restoreCustomerArtifactsFromSpool } from "./files.js";

export type ArchiveState = "spool" | "bundled" | "exported";

export type ArchiveIndexRow = {
  customer_id: string;
  archived_at: string;
  archived_by: string;
  archive_month: string;
  archive_state: ArchiveState;
  spool_path: string | null;
  bundle_filename: string | null;
  bundle_checksum: string | null;
  manifest_json: Record<string, unknown>;
  size_bytes: string | number;
  exported_at: string | null;
  notes: string | null;
};

export type RestoreRequestRow = {
  id: string;
  customer_id: string;
  requested_by: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

function archiveMonth(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function spoolPathFor(customerId: string, month: string): string {
  const cfg = loadConfig();
  return path.join(cfg.archiveDirectory, "spool", month, customerId);
}

async function loadCustomerSummary(customerId: string): Promise<{
  id: string;
  name: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
} | null> {
  const result = await pool.query(
    `select id::text, name, archived_at, archived_by::text, archive_reason
       from customers where id = $1`,
    [customerId]
  );
  return result.rows[0] ?? null;
}

async function loadAssessments(customerId: string): Promise<Array<{ id: string; status: string }>> {
  const rows = await pool.query<{ id: string; status: string }>(
    `select id::text, status from assessments where customer_id = $1`,
    [customerId]
  );
  return rows.rows;
}

async function loadEvidenceKeys(customerId: string): Promise<string[]> {
  const rows = await pool.query<{ object_key: string }>(
    `select object_key
       from evidence_files ef
       join assessments a on a.id = ef.assessment_id
      where a.customer_id = $1`,
    [customerId]
  );
  return rows.rows.map((row) => row.object_key);
}

async function loadReportKeys(customerId: string): Promise<string[]> {
  const rows = await pool.query<{ object_key: string }>(
    `select object_key
       from reports r
       join assessments a on a.id = r.assessment_id
      where a.customer_id = $1
        and r.object_key is not null`,
    [customerId]
  );
  return rows.rows.map((row) => row.object_key);
}

export type ArchiveCustomerOptions = {
  customerId: string;
  actorUserId: string;
  reason: string;
};

export async function archiveCustomer(opts: ArchiveCustomerOptions): Promise<ArchiveIndexRow> {
  if (!isUuid(opts.customerId)) {
    throw new Error("Invalid customer id");
  }
  const customer = await loadCustomerSummary(opts.customerId);
  if (!customer) throw new Error("Customer not found");
  if (customer.archived_at) throw new Error("Customer is already archived");

  const month = archiveMonth();
  const spoolPath = spoolPathFor(opts.customerId, month);
  await fs.mkdir(spoolPath, { recursive: true });

  const assessments = await loadAssessments(opts.customerId);
  const evidenceKeys = await loadEvidenceKeys(opts.customerId);
  const reportKeys = await loadReportKeys(opts.customerId);

  const movedSizeBytes = await moveCustomerArtifactsToSpool({
    customerId: opts.customerId,
    spoolPath,
    evidenceKeys,
    reportKeys
  });

  const now = new Date();
  await pool.query(
    `update customers
        set archived_at = $2,
            archived_by = $3,
            archive_reason = $4,
            updated_at = now()
      where id = $1`,
    [opts.customerId, now.toISOString(), opts.actorUserId, opts.reason]
  );
  await pool.query(
    `update assessments
        set archived_at = $2,
            archived_by = $3
      where customer_id = $1
        and archived_at is null`,
    [opts.customerId, now.toISOString(), opts.actorUserId]
  );

  const manifest = {
    customerId: opts.customerId,
    customerName: customer.name,
    archivedAt: now.toISOString(),
    archivedBy: opts.actorUserId,
    reason: opts.reason,
    assessments,
    evidenceKeys,
    reportKeys
  };

  await pool.query(
    `insert into archive_index
       (customer_id, archived_at, archived_by, archive_month, archive_state,
        spool_path, manifest_json, size_bytes)
     values ($1, $2, $3, $4, 'spool', $5, $6::jsonb, $7)
     on conflict (customer_id) do update set
        archived_at = excluded.archived_at,
        archived_by = excluded.archived_by,
        archive_month = excluded.archive_month,
        archive_state = 'spool',
        spool_path = excluded.spool_path,
        manifest_json = excluded.manifest_json,
        size_bytes = excluded.size_bytes`,
    [
      opts.customerId,
      now.toISOString(),
      opts.actorUserId,
      month,
      spoolPath,
      JSON.stringify(manifest),
      movedSizeBytes
    ]
  );

  await appendAuditEvent({
    actor: opts.actorUserId,
    action: "customer.archived",
    entity: "customer",
    entityId: opts.customerId,
    ip: null,
    userAgent: null,
    payload: { reason: opts.reason, sizeBytes: movedSizeBytes, month }
  });
  await appendActivityEvent({
    userId: opts.actorUserId,
    action: "customer.archived",
    entityType: "customer",
    entityId: opts.customerId,
    before: { archivedAt: null },
    after: { archivedAt: now.toISOString(), reason: opts.reason }
  });
  await publishEmailTopic({
    topic: "customer.archived",
    subject: `Customer archived: ${customer.name}`,
    text: `Customer "${customer.name}" was archived by ${opts.actorUserId}.\nReason: ${opts.reason}`
  }).catch(() => undefined);

  const row = await pool.query<ArchiveIndexRow>(
    `select * from archive_index where customer_id = $1`,
    [opts.customerId]
  );
  return row.rows[0]!;
}

export async function listArchive(month?: string): Promise<Array<ArchiveIndexRow & {
  customer_name: string;
  archived_by_name: string | null;
}>> {
  const params: unknown[] = [];
  let where = "";
  if (month) {
    params.push(month);
    where = `where ai.archive_month = $1`;
  }
  const result = await pool.query(
    `select ai.*,
            c.name as customer_name,
            u.name as archived_by_name
       from archive_index ai
       join customers c on c.id = ai.customer_id
       left join users u on u.id = ai.archived_by
       ${where}
       order by ai.archived_at desc`,
    params
  );
  return result.rows as Array<ArchiveIndexRow & {
    customer_name: string;
    archived_by_name: string | null;
  }>;
}

export async function createRestoreRequest(opts: {
  customerId: string;
  requestedBy: string;
  reason: string;
}): Promise<RestoreRequestRow> {
  const id = randomUUID();
  const customer = await loadCustomerSummary(opts.customerId);
  if (!customer) throw new Error("Customer not found");
  if (!customer.archived_at) throw new Error("Customer is not archived");
  await pool.query(
    `insert into archive_restore_requests
       (id, customer_id, requested_by, reason)
     values ($1, $2, $3, $4)`,
    [id, opts.customerId, opts.requestedBy, opts.reason]
  );
  const row = await pool.query<RestoreRequestRow>(
    `select * from archive_restore_requests where id = $1`,
    [id]
  );
  await appendAuditEvent({
    actor: opts.requestedBy,
    action: "archive.restore_requested",
    entity: "customer",
    entityId: opts.customerId,
    ip: null,
    userAgent: null,
    payload: { requestId: id, reason: opts.reason }
  });
  await publishEmailTopic({
    topic: "archive.restore_requested",
    subject: `Archive restore requested: ${customer.name}`,
    text: `User ${opts.requestedBy} requested restoration of archived customer "${customer.name}".\nReason: ${opts.reason}`
  }).catch(() => undefined);
  return row.rows[0]!;
}

export async function listRestoreRequests(status?: "pending" | "approved" | "denied"): Promise<Array<RestoreRequestRow & {
  customer_name: string;
  requested_by_name: string | null;
}>> {
  const params: unknown[] = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `where r.status = $1`;
  }
  const rows = await pool.query(
    `select r.*,
            c.name as customer_name,
            u.name as requested_by_name
       from archive_restore_requests r
       join customers c on c.id = r.customer_id
       left join users u on u.id = r.requested_by
       ${where}
       order by r.requested_at desc`,
    params
  );
  return rows.rows as Array<RestoreRequestRow & {
    customer_name: string;
    requested_by_name: string | null;
  }>;
}

export async function approveRestoreRequest(opts: {
  requestId: string;
  approvedBy: string;
  note?: string;
}): Promise<{ customerId: string }> {
  const request = await pool.query<RestoreRequestRow>(
    `select * from archive_restore_requests where id = $1`,
    [opts.requestId]
  );
  const row = request.rows[0];
  if (!row) throw new Error("Restore request not found");
  if (row.status !== "pending") throw new Error("Restore request already resolved");

  const archive = await pool.query<ArchiveIndexRow>(
    `select * from archive_index where customer_id = $1`,
    [row.customer_id]
  );
  const arch = archive.rows[0];
  if (!arch) throw new Error("Archive index entry missing");

  if (arch.archive_state === "spool" && arch.spool_path) {
    await restoreCustomerArtifactsFromSpool({
      customerId: row.customer_id,
      spoolPath: arch.spool_path
    });
  } else {
    throw new Error(
      `Cannot restore from state '${arch.archive_state}'. Bundled archives must be re-imported via the admin re-import flow.`
    );
  }

  await pool.query(
    `update customers
        set archived_at = null,
            archived_by = null,
            archive_reason = null,
            updated_at = now()
      where id = $1`,
    [row.customer_id]
  );
  await pool.query(
    `update assessments
        set archived_at = null,
            archived_by = null
      where customer_id = $1`,
    [row.customer_id]
  );
  await pool.query(
    `update archive_restore_requests
        set status = 'approved',
            resolved_by = $2,
            resolved_at = now(),
            resolution_note = $3
      where id = $1`,
    [opts.requestId, opts.approvedBy, opts.note ?? null]
  );
  await pool.query(
    `delete from archive_index where customer_id = $1`,
    [row.customer_id]
  );

  const customer = await loadCustomerSummary(row.customer_id);

  await appendAuditEvent({
    actor: opts.approvedBy,
    action: "archive.restore_approved",
    entity: "customer",
    entityId: row.customer_id,
    ip: null,
    userAgent: null,
    payload: { requestId: opts.requestId, note: opts.note ?? null }
  });
  await publishEmailTopic({
    topic: "archive.restore_approved",
    subject: `Archive restore approved: ${customer?.name ?? row.customer_id}`,
    text: `Restore request ${opts.requestId} was approved by ${opts.approvedBy}.`
  }).catch(() => undefined);

  return { customerId: row.customer_id };
}

export async function denyRestoreRequest(opts: {
  requestId: string;
  deniedBy: string;
  note: string;
}): Promise<void> {
  const request = await pool.query<RestoreRequestRow>(
    `select * from archive_restore_requests where id = $1`,
    [opts.requestId]
  );
  const row = request.rows[0];
  if (!row) throw new Error("Restore request not found");
  if (row.status !== "pending") throw new Error("Restore request already resolved");
  await pool.query(
    `update archive_restore_requests
        set status = 'denied',
            resolved_by = $2,
            resolved_at = now(),
            resolution_note = $3
      where id = $1`,
    [opts.requestId, opts.deniedBy, opts.note]
  );
  const customer = await loadCustomerSummary(row.customer_id);
  await appendAuditEvent({
    actor: opts.deniedBy,
    action: "archive.restore_denied",
    entity: "customer",
    entityId: row.customer_id,
    ip: null,
    userAgent: null,
    payload: { requestId: opts.requestId, note: opts.note }
  });
  await publishEmailTopic({
    topic: "archive.restore_denied",
    subject: `Archive restore denied: ${customer?.name ?? row.customer_id}`,
    text: `Restore request ${opts.requestId} was denied by ${opts.deniedBy}.\nReason: ${opts.note}`
  }).catch(() => undefined);
}

export async function isCustomerArchived(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const row = await pool.query<{ archived_at: string | null }>(
    `select archived_at from customers where id = $1`,
    [customerId]
  );
  return !!row.rows[0]?.archived_at;
}
