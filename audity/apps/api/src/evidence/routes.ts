import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { ensureBucket, signedGetUrl, storageBucket, storageClient } from "../storage/service.js";

function mapEvidence(row: Record<string, unknown>) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    uploadedBy: row.uploaded_by,
    objectKey: row.object_key,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size ?? 0),
    notes: row.notes,
    createdAt: row.created_at
  };
}

export async function registerEvidenceRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart);

  app.post<{ Params: { id: string } }>(
    "/api/assessments/:id/evidence",
    { preHandler: requireCsrfPermission("evidence.upload") },
    async (request, reply) => {
      const config = loadConfig();
      const assessment = await pool.query("select id from assessments where id = $1", [
        request.params.id
      ]);
      if (!assessment.rows[0]) {
        return reply
          .code(404)
          .send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const file = await request.file({
        limits: { fileSize: config.uploadMaxBytes }
      });
      if (!file) {
        return reply.code(400).send({ code: "FILE_REQUIRED", message: "Evidence file is required" });
      }
      if (!config.uploadAllowedTypes.includes(file.mimetype)) {
        return reply.code(400).send({ code: "FILE_TYPE_BLOCKED", message: "File type is not allowed" });
      }
      await ensureBucket();
      const id = randomUUID();
      const objectKey = `evidence/${request.params.id}/${id}/${file.filename}`;
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of file.file) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        chunks.push(buffer);
      }
      await storageClient.putObject(storageBucket(), objectKey, Buffer.concat(chunks), size, {
        "Content-Type": file.mimetype
      });
      const result = await pool.query(
        `insert into evidence_items
          (id, assessment_id, uploaded_by, object_key, file_name, mime_type, file_size, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          id,
          request.params.id,
          request.user!.sub,
          objectKey,
          file.filename,
          file.mimetype,
          size,
          ""
        ]
      );
      const evidence = mapEvidence(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "evidence.uploaded",
        entityType: "evidence",
        entityId: id,
        before: null,
        after: evidence
      });
      return reply.code(201).send({ evidence });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/evidence",
    { preHandler: requirePermission("assessment.view") },
    async (request) => {
      const result = await pool.query(
        `select * from evidence_items
         where assessment_id = $1 and deleted_at is null
         order by created_at desc`,
        [request.params.id]
      );
      return { evidenceItems: result.rows.map(mapEvidence) };
    }
  );

  app.get<{ Params: { id: string; evidenceId: string } }>(
    "/api/assessments/:id/evidence/:evidenceId/download",
    { preHandler: requirePermission("evidence.download") },
    async (request, reply) => {
      const result = await pool.query(
        `select * from evidence_items
         where id = $1 and assessment_id = $2 and deleted_at is null`,
        [request.params.evidenceId, request.params.id]
      );
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "EVIDENCE_NOT_FOUND", message: "Evidence not found" });
      }
      const downloadUrl = await signedGetUrl(result.rows[0].object_key);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "evidence.downloaded",
        entityType: "evidence",
        entityId: request.params.evidenceId,
        before: null,
        after: { evidenceId: request.params.evidenceId, assessmentId: request.params.id }
      });
      return { downloadUrl };
    }
  );

  app.delete<{ Params: { id: string; evidenceId: string } }>(
    "/api/assessments/:id/evidence/:evidenceId",
    { preHandler: requireCsrfPermission("evidence.upload") },
    async (request, reply) => {
      const before = await pool.query(
        `select * from evidence_items
         where id = $1 and assessment_id = $2 and deleted_at is null`,
        [request.params.evidenceId, request.params.id]
      );
      if (!before.rows[0]) {
        return reply.code(404).send({ code: "EVIDENCE_NOT_FOUND", message: "Evidence not found" });
      }
      await pool.query("update evidence_items set deleted_at = now() where id = $1", [
        request.params.evidenceId
      ]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "evidence.deleted",
        entityType: "evidence",
        entityId: request.params.evidenceId,
        before: mapEvidence(before.rows[0]),
        after: { deleted: true }
      });
      return { status: "ok" };
    }
  );
}
