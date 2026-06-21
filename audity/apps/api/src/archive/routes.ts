import path from "node:path";
import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { validateBody, isUuid } from "../utils/validation.js";
import {
  archiveCustomer,
  approveRestoreRequest,
  createRestoreRequest,
  denyRestoreRequest,
  isCustomerArchived,
  listArchive,
  listRestoreRequests
} from "./service.js";
import { canAccessCustomer, canViewCustomerIncludingArchived, isAdminRole } from "../customers/access.js";
import { pool } from "../db/client.js";
import { loadConfig } from "../config.js";
import { bundleMonth, decodeBundle } from "./bundle.js";

const archiveSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const restoreRequestSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const resolveSchema = z.object({ note: z.string().trim().min(3).max(500).optional() });
const denySchema = z.object({ note: z.string().trim().min(3).max(500) });
const bundleMonthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be in YYYY-MM format")
});

function safeBundleFilename(name: string): string | null {
  if (!/^[0-9A-Za-z._-]+\.audity-archive$/.test(name)) return null;
  if (name.includes("..")) return null;
  return name;
}

export async function registerArchiveRoutes(app: FastifyInstance): Promise<void> {
  // ----- User-facing routes (require customer.archive permission) -----
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/api/customers/:id/archive",
    { preHandler: requireCsrfPermission("customer.archive") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const body = validateBody(archiveSchema, request.body, reply);
      if (!body) return;
      try {
        const result = await archiveCustomer({
          customerId: request.params.id,
          actorUserId: request.user!.sub,
          reason: body.reason
        });
        return reply.code(201).send({ archive: result });
      } catch (error) {
        return reply.code(400).send({
          code: "ARCHIVE_FAILED",
          message: error instanceof Error ? error.message : "Archive failed"
        });
      }
    }
  );

  // Lets a non-admin user with assessment.view raise a restore request
  // for an archived customer they previously owned or shared.
  app.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/api/customers/:id/restore-request",
    { preHandler: requireCsrfPermission("assessment.view") },
    async (request, reply) => {
      if (!isUuid(request.params.id)) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      if (!(await canViewCustomerIncludingArchived(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      if (!(await isCustomerArchived(request.params.id))) {
        return reply.code(400).send({
          code: "NOT_ARCHIVED",
          message: "Customer is not archived"
        });
      }
      const body = validateBody(restoreRequestSchema, request.body, reply);
      if (!body) return;
      try {
        const result = await createRestoreRequest({
          customerId: request.params.id,
          requestedBy: request.user!.sub,
          reason: body.reason
        });
        return reply.code(201).send({ request: result });
      } catch (error) {
        return reply.code(400).send({
          code: "RESTORE_REQUEST_FAILED",
          message: error instanceof Error ? error.message : "Restore request failed"
        });
      }
    }
  );

  // List archived customers visible to the current user (their own + shared).
  // Returned customers are read-only on the frontend.
  app.get(
    "/api/customers/archived",
    { preHandler: requirePermission("assessment.view") },
    async (request) => {
      const admin = isAdminRole(request.user!.role);
      const result = await pool.query(
        `select c.id::text,
                c.name,
                c.industry,
                c.archived_at,
                c.archived_by::text,
                c.archive_reason,
                u.name as archived_by_name,
                exists(
                  select 1 from archive_restore_requests r
                   where r.customer_id = c.id
                     and r.requested_by = $1
                     and r.status = 'pending'
                ) as restore_request_pending
           from customers c
           left join users u on u.id = c.archived_by
          where c.archived_at is not null
            ${admin ? "" : `and (
              c.created_by_user_id = $1
              or exists (
                select 1 from customer_shares cs
                where cs.customer_id = c.id
                  and cs.shared_with_user_id = $1
                  and cs.revoked_at is null
              )
            )`}
          order by c.archived_at desc`,
        [request.user!.sub]
      );
      return { customers: result.rows };
    }
  );

  // ----- Admin routes -----
  app.get<{ Querystring: { month?: string } }>(
    "/api/admin/archive",
    { preHandler: requirePermission("archive.approve") },
    async (request) => {
      const rows = await listArchive(request.query.month);
      return { archive: rows };
    }
  );

  app.get<{ Querystring: { status?: string } }>(
    "/api/admin/archive/restore-requests",
    { preHandler: requirePermission("archive.approve") },
    async (request) => {
      const status = request.query.status;
      const requests = await listRestoreRequests(
        status === "approved" || status === "denied" || status === "pending" ? status : undefined
      );
      return { requests };
    }
  );

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    "/api/admin/archive/restore-requests/:id/approve",
    { preHandler: requireCsrfPermission("archive.approve") },
    async (request, reply) => {
      const body = validateBody(resolveSchema, request.body ?? {}, reply);
      if (!body) return;
      try {
        const result = await approveRestoreRequest({
          requestId: request.params.id,
          approvedBy: request.user!.sub,
          note: body.note
        });
        return { ok: true, customerId: result.customerId };
      } catch (error) {
        return reply.code(400).send({
          code: "RESTORE_APPROVE_FAILED",
          message: error instanceof Error ? error.message : "Approve failed"
        });
      }
    }
  );

  // ----- Bundles -----
  app.get(
    "/api/admin/archive/bundles",
    { preHandler: requirePermission("archive.approve") },
    async () => {
      const cfg = loadConfig();
      const dir = path.join(cfg.archiveDirectory, "bundled");
      try {
        const entries = await fs.readdir(dir);
        const bundles = [] as Array<{ filename: string; month: string; size_bytes: number; created_at: string }>;
        for (const entry of entries) {
          if (!entry.endsWith(".audity-archive")) continue;
          const full = path.join(dir, entry);
          const stat = await fs.stat(full).catch(() => null);
          if (!stat) continue;
          const month = entry.replace(/\.audity-archive$/, "");
          bundles.push({
            filename: entry,
            month,
            size_bytes: stat.size,
            created_at: stat.mtime.toISOString()
          });
        }
        bundles.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return { bundles };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { bundles: [] };
        throw error;
      }
    }
  );

  app.post<{ Body: { month: string } }>(
    "/api/admin/archive/bundles",
    { preHandler: requireCsrfPermission("archive.approve") },
    async (request, reply) => {
      const body = validateBody(bundleMonthSchema, request.body, reply);
      if (!body) return;
      try {
        const result = await bundleMonth(body.month, request.user!.sub);
        return { ok: true, bundle: result };
      } catch (error) {
        return reply.code(400).send({
          code: "BUNDLE_FAILED",
          message: error instanceof Error ? error.message : "Bundle failed"
        });
      }
    }
  );

  app.get<{ Params: { filename: string } }>(
    "/api/admin/archive/bundles/:filename/download",
    { preHandler: requirePermission("archive.approve") },
    async (request, reply) => {
      const safe = safeBundleFilename(request.params.filename);
      if (!safe) {
        return reply.code(400).send({ code: "INVALID_FILENAME", message: "Invalid bundle filename" });
      }
      const cfg = loadConfig();
      const full = path.join(cfg.archiveDirectory, "bundled", safe);
      try {
        const data = await fs.readFile(full);
        reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Disposition", `attachment; filename="${safe}"`);
        return reply.send(data);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return reply.code(404).send({ code: "BUNDLE_NOT_FOUND", message: "Bundle not found" });
        }
        throw error;
      }
    }
  );

  app.post(
    "/api/admin/archive/bundles/import",
    {
      preHandler: requireCsrfPermission("archive.approve"),
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } }
    },
    async (request, reply) => {
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({ code: "FILE_REQUIRED", message: "Bundle upload required" });
      }
      if (!file.filename.endsWith(".audity-archive")) {
        return reply.code(415).send({
          code: "FILE_TYPE_BLOCKED",
          message: "Only .audity-archive files can be re-imported."
        });
      }
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) chunks.push(chunk as Buffer);
      const buffer = Buffer.concat(chunks);
      let decoded;
      try {
        decoded = decodeBundle(buffer);
      } catch (error) {
        return reply.code(400).send({
          code: "BUNDLE_DECODE_FAILED",
          message: error instanceof Error ? error.message : "Decode failed",
          hint: "If you rotated AUDITY_ENCRYPTION_KEY since this bundle was written, decrypt it offline using the audity-archive CLI with the old key, then re-import."
        });
      }

      const cfg = loadConfig();
      const safe = safeBundleFilename(file.filename);
      if (!safe) {
        return reply.code(400).send({ code: "INVALID_FILENAME", message: "Invalid bundle filename" });
      }
      const bundleDir = path.join(cfg.archiveDirectory, "bundled");
      await fs.mkdir(bundleDir, { recursive: true });
      await fs.writeFile(path.join(bundleDir, safe), buffer);

      // Extract the contents into spool/<month>/<customerId>/... so admins can
      // approve restores on individual customers via the standard flow.
      const month = decoded.manifest.month;
      let restored = 0;
      for (const customer of decoded.manifest.customers) {
        const targetDir = path.join(cfg.archiveDirectory, "spool", month, customer.customerId);
        await fs.mkdir(targetDir, { recursive: true });
        const prefix = `${customer.customerId}/`;
        for (const [name, content] of Object.entries(decoded.entries)) {
          if (!name.startsWith(prefix)) continue;
          const rel = name.slice(prefix.length);
          if (!rel || rel.includes("..")) continue;
          const dest = path.join(targetDir, rel);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, Buffer.from(content));
        }
        await pool.query(
          `insert into archive_index
             (customer_id, archived_at, archived_by, archive_month, archive_state,
              spool_path, bundle_filename, manifest_json, size_bytes, notes)
           values ($1, $2, $3, $4, 'spool', $5, $6, $7::jsonb, $8, 'Re-imported from bundle')
           on conflict (customer_id) do update set
             archive_state = 'spool',
             spool_path = excluded.spool_path,
             bundle_filename = excluded.bundle_filename,
             notes = 'Re-imported from bundle'`,
          [
            customer.customerId,
            customer.archivedAt,
            customer.archivedBy,
            month,
            targetDir,
            safe,
            JSON.stringify(customer.manifest),
            customer.sizeBytes
          ]
        );
        restored++;
      }
      return {
        ok: true,
        filename: safe,
        month,
        restored,
        message: `Re-imported ${restored} customer entries. Approve individual restore requests to re-upload evidence to MinIO.`
      };
    }
  );

  // Inspect a bundle without committing — used by P8 re-import UI to preview.
  app.get<{ Params: { filename: string } }>(
    "/api/admin/archive/bundles/:filename/inspect",
    { preHandler: requirePermission("archive.approve") },
    async (request, reply) => {
      const safe = safeBundleFilename(request.params.filename);
      if (!safe) {
        return reply.code(400).send({ code: "INVALID_FILENAME", message: "Invalid bundle filename" });
      }
      const cfg = loadConfig();
      const full = path.join(cfg.archiveDirectory, "bundled", safe);
      try {
        const data = await fs.readFile(full);
        const decoded = decodeBundle(data);
        return {
          manifest: decoded.manifest,
          entryCount: Object.keys(decoded.entries).length
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return reply.code(404).send({ code: "BUNDLE_NOT_FOUND", message: "Bundle not found" });
        }
        return reply.code(400).send({
          code: "BUNDLE_DECODE_FAILED",
          message: error instanceof Error ? error.message : "Decode failed"
        });
      }
    }
  );

  app.post<{ Params: { id: string }; Body: { note: string } }>(
    "/api/admin/archive/restore-requests/:id/deny",
    { preHandler: requireCsrfPermission("archive.approve") },
    async (request, reply) => {
      const body = validateBody(denySchema, request.body, reply);
      if (!body) return;
      try {
        await denyRestoreRequest({
          requestId: request.params.id,
          deniedBy: request.user!.sub,
          note: body.note
        });
        return { ok: true };
      } catch (error) {
        return reply.code(400).send({
          code: "RESTORE_DENY_FAILED",
          message: error instanceof Error ? error.message : "Deny failed"
        });
      }
    }
  );
}
