import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { canAccessAssessment } from "../customers/access.js";
import { pool } from "../db/client.js";
import { emailQueue } from "../jobs/queue.js";
import {
  ensureBucket,
  objectBuffer,
  signedGetUrl,
  storageBucket,
  storageClient
} from "../storage/service.js";
import { decryptText, encryptText } from "../utils/crypto.js";
import { validateBody } from "../utils/validation.js";

type EmailSettingsBody = {
  smtpHost?: string;
  smtpPort?: number;
  smtpTls?: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  sender?: string;
};

type SendReportBody = {
  recipient?: string;
  subject?: string;
  message?: string;
  includeRiskRegister?: boolean;
  warningAccepted?: boolean;
};

const emailSettingsSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpTls: z.boolean().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  sender: z.string().optional()
});

const sendReportSchema = z.object({
  recipient: z.string().email(),
  subject: z.string().optional(),
  message: z.string().optional(),
  includeRiskRegister: z.boolean().optional(),
  warningAccepted: z.literal(true)
});

function mapEmailSettings(row: Record<string, unknown> | undefined) {
  return {
    id: row?.id ?? null,
    smtpHost: row?.smtp_host ?? "",
    smtpPort: row?.smtp_port ?? 587,
    smtpTls: row?.smtp_tls ?? true,
    smtpUser: row?.smtp_user ?? "",
    sender: row?.sender ?? "",
    hasPassword: Boolean(row?.smtp_password_encrypted),
    updatedAt: row?.updated_at ?? null
  };
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function encryptedZipPackage(files: Record<string, Buffer | string>) {
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [
      name,
      Buffer.isBuffer(content) ? new Uint8Array(content) : Buffer.from(content, "utf8")
    ])
  );
  const zip = Buffer.from(zipSync(entries));
  const checksum = createHash("sha256").update(zip).digest("hex");
  return {
    format: "audity-secure-package",
    version: 1,
    container: "zip",
    encryption: "AES-256-GCM",
    checksum,
    encrypted: encryptText(zip.toString("base64"))
  };
}

function decryptZipPackage(payload: { encrypted?: string; checksum?: string }) {
  if (!payload.encrypted) {
    throw new Error("Encrypted package is invalid");
  }
  const zip = Buffer.from(decryptText(payload.encrypted), "base64");
  if (payload.checksum && createHash("sha256").update(zip).digest("hex") !== payload.checksum) {
    throw new Error("Package checksum does not match");
  }
  return unzipSync(new Uint8Array(zip));
}

async function riskRegisterCsv(assessmentId: string): Promise<string> {
  const risks = await pool.query(
    `select title, likelihood, impact, risk_score, rating, treatment_option, owner, treatment_plan,
       due_date, status, draft, source_type, source_score, acceptance_reason, acceptance_expires_at
     from risks where assessment_id = $1 and status <> 'deleted' order by risk_score desc nulls last`,
    [assessmentId]
  );
  const columns = ["title", "likelihood", "impact", "risk_score", "rating", "treatment_option", "owner", "treatment_plan", "due_date", "status", "draft", "source_type", "source_score", "acceptance_reason", "acceptance_expires_at"];
  const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    columns.map(cell).join(","),
    ...risks.rows.map((row) => columns.map((column) => cell(row[column])).join(","))
  ].join("\n");
}

async function reportPackage(assessmentId: string, reportId: string, includeRiskRegister = true) {
  const report = await pool.query(
    `select r.*, a.type, c.name as customer_name
     from reports r
     join assessments a on a.id = r.assessment_id
     join customers c on c.id = a.customer_id
     where r.id = $1 and r.assessment_id = $2`,
    [reportId, assessmentId]
  );
  if (!report.rows[0]) return null;
  if (!report.rows[0].pdf_object_key) {
    throw new Error("Report PDF must be exported before secure package creation");
  }
  const pdf = await objectBuffer(report.rows[0].pdf_object_key);
  const files: Record<string, Buffer | string> = {
    "report.pdf": pdf,
    "metadata.json": jsonBuffer({
      reportId,
      assessmentId,
      customerName: report.rows[0].customer_name,
      reportVersion: report.rows[0].report_version,
      exportedAt: report.rows[0].exported_at,
      generatedAt: new Date().toISOString()
    }),
    "checksum.txt": createHash("sha256").update(pdf).digest("hex")
  };
  if (includeRiskRegister) {
    files["risk-register.csv"] = await riskRegisterCsv(assessmentId);
  }
  return {
    assessmentId,
    reportId,
    customerName: report.rows[0].customer_name,
    createdAt: new Date().toISOString(),
    package: encryptedZipPackage(files)
  };
}

function assessmentExportPackage(bundle: NonNullable<Awaited<ReturnType<typeof loadAssessmentBundle>>>) {
  const files: Record<string, Buffer | string> = {
    "metadata.json": jsonBuffer({
      format: bundle.format,
      version: bundle.version,
      exportedAt: bundle.exportedAt,
      assessmentId: bundle.assessment.id,
      customerName: bundle.assessment.customer_name
    }),
    "db-dump.json": jsonBuffer(bundle)
  };
  for (const evidence of bundle.evidenceFiles ?? []) {
    files[`evidence/${evidence.fileName}`] = Buffer.from(evidence.contentBase64, "base64");
  }
  return encryptedZipPackage(files);
}

async function loadAssessmentBundle(assessmentId: string) {
  const [assessment, answers, findings, risks, roadmap, evidence, reports] = await Promise.all([
    pool.query(
      `select a.*, c.name as customer_name, c.industry, c.regulatory_context, c.critical_systems,
        c.business_criticality, c.status as customer_status
       from assessments a join customers c on c.id = a.customer_id
       where a.id = $1`,
      [assessmentId]
    ),
    pool.query(
      `select aq.framework_control_id, aq.question, ca.score, ca.answer_state, ca.evidence_status,
        ca.confidence_level, ca.notes
       from assessment_questions aq
       left join control_answers ca on ca.assessment_question_id = aq.id
       where aq.assessment_id = $1`,
      [assessmentId]
    ),
    pool.query("select * from findings where assessment_id = $1", [assessmentId]),
    pool.query("select * from risks where assessment_id = $1 and status <> 'deleted'", [assessmentId]),
    pool.query("select * from roadmap_items where assessment_id = $1", [assessmentId]),
    pool.query("select * from evidence_items where assessment_id = $1 and deleted_at is null", [assessmentId]),
    pool.query("select * from reports where assessment_id = $1", [assessmentId])
  ]);
  if (!assessment.rows[0]) return null;
  const evidenceFiles = await Promise.all(
    evidence.rows.map(async (row) => ({
      fileName: row.file_name,
      mimeType: row.mime_type,
      notes: row.notes,
      contentBase64: (await objectBuffer(row.object_key)).toString("base64")
    }))
  );
  return {
    format: "audity-cisoassess",
    version: 1,
    exportedAt: new Date().toISOString(),
    assessment: assessment.rows[0],
    answers: answers.rows,
    findings: findings.rows,
    risks: risks.rows,
    roadmapItems: roadmap.rows,
    evidenceFiles,
    reports: reports.rows.map((row) => ({
      templateId: row.template_id,
      status: row.status,
      content: row.content,
      authorInfo: row.author_info,
      selectedBlocks: row.selected_blocks,
      htmlPreview: row.html_preview,
      reportVersion: row.report_version
    }))
  };
}

export async function registerSecureRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/email-settings", { preHandler: requirePermission("email.manage") }, async () => {
    const result = await pool.query("select * from email_settings order by updated_at desc limit 1");
    return { emailSettings: mapEmailSettings(result.rows[0]) };
  });

  app.get("/api/admin/email-delivery-log", { preHandler: requirePermission("email.manage") }, async () => {
    const result = await pool.query(
      `select edl.*, r.status as report_status
       from email_delivery_log edl
       left join reports r on r.id = edl.report_id
       order by edl.created_at desc
       limit 100`
    );
    return {
      emailDeliveryLog: result.rows.map((row) => ({
        id: row.id,
        sender: row.sender,
        recipient: row.recipient,
        reportId: row.report_id,
        assessmentId: row.assessment_id,
        encryptionMethod: row.encryption_method,
        smtpResult: row.smtp_result,
        createdAt: row.created_at
      }))
    };
  });

  app.put<{ Body: EmailSettingsBody }>(
    "/api/admin/email-settings",
    { preHandler: requireCsrfPermission("email.manage") },
    async (request, reply) => {
      const body = validateBody(emailSettingsSchema, request.body, reply);
      if (!body) return;
      const previous = await pool.query("select * from email_settings order by updated_at desc limit 1");
      const passwordEncrypted = body.smtpPassword
        ? encryptText(body.smtpPassword)
        : previous.rows[0]?.smtp_password_encrypted ?? null;
      const result = await pool.query(
        `insert into email_settings (id, smtp_host, smtp_port, smtp_tls, smtp_user, smtp_password_encrypted, sender)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          randomUUID(),
          body.smtpHost ?? previous.rows[0]?.smtp_host ?? "",
          body.smtpPort ?? previous.rows[0]?.smtp_port ?? 587,
          body.smtpTls ?? previous.rows[0]?.smtp_tls ?? true,
          body.smtpUser ?? previous.rows[0]?.smtp_user ?? "",
          passwordEncrypted,
          body.sender ?? previous.rows[0]?.sender ?? ""
        ]
      );
      return { emailSettings: mapEmailSettings(result.rows[0]) };
    }
  );

  app.post<{ Params: { id: string; reportId: string }; Body: SendReportBody }>(
    "/api/assessments/:id/reports/:reportId/send",
    { preHandler: requireCsrfPermission("report.send") },
    async (request, reply) => {
      const body = validateBody(sendReportSchema, request.body, reply);
      if (!body) return;
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const payload = await reportPackage(
        request.params.id,
        request.params.reportId,
        body.includeRiskRegister ?? true
      );
      if (!payload) {
        return reply.code(404).send({ code: "REPORT_NOT_FOUND", message: "Report not found" });
      }
      const secure = payload.package;
      const objectKey = `secure-packages/${request.params.reportId}/Assessment_Report_${Date.now()}.auditysecure`;
      await ensureBucket();
      await storageClient.putObject(storageBucket(), objectKey, jsonBuffer(secure), undefined, {
        "Content-Type": "application/octet-stream"
      });
      const job = await emailQueue.add("send-secure-report", {
        assessmentId: request.params.id,
        reportId: request.params.reportId,
        userId: request.user!.sub,
        recipient: body.recipient,
        subject: body.subject ?? "Audity secure assessment report",
        message: body.message ?? "",
        packageObjectKey: objectKey
      });
      return reply.code(202).send({
        jobId: job.id,
        packageObjectKey: objectKey,
        packageDownloadUrl: await signedGetUrl(objectKey)
      });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/email-jobs/:id/status",
    { preHandler: requirePermission("report.send") },
    async (request, reply) => {
      const job = await emailQueue.getJob(request.params.id);
      if (!job) return { id: request.params.id, status: "not_found" };
      const data = job.data as { assessmentId?: string } | null;
      if (!data?.assessmentId || !(await canAccessAssessment(request.user!, data.assessmentId))) {
        return reply.code(404).send({ code: "JOB_NOT_FOUND", message: "Job not found" });
      }
      return {
        id: job.id,
        status: await job.getState(),
        progress: job.progress,
        failedReason: job.failedReason,
        result: job.returnvalue
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/assessments/:id/export",
    { preHandler: requirePermission("report.export") },
    async (request, reply) => {
      if (!(await canAccessAssessment(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const bundle = await loadAssessmentBundle(request.params.id);
      if (!bundle) {
        return reply.code(404).send({ code: "ASSESSMENT_NOT_FOUND", message: "Assessment not found" });
      }
      const secure = assessmentExportPackage(bundle);
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename=audity-assessment-${request.params.id}.cisoassess`);
      return jsonBuffer(secure);
    }
  );

  app.post(
    "/api/assessments/import",
    { preHandler: requireCsrfPermission("assessment.create") },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: 50 * 1024 * 1024 } });
      if (!file) {
        return reply.code(400).send({ code: "FILE_REQUIRED", message: ".cisoassess file is required" });
      }
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const secure = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { encrypted?: string; checksum?: string };
      let bundle: Awaited<ReturnType<typeof loadAssessmentBundle>>;
      try {
        const files = decryptZipPackage(secure);
        const dump = files["db-dump.json"];
        if (!dump) {
          return reply.code(400).send({ code: "IMPORT_INVALID", message: "Assessment bundle is invalid" });
        }
        bundle = JSON.parse(Buffer.from(dump).toString("utf8")) as Awaited<ReturnType<typeof loadAssessmentBundle>>;
      } catch (error) {
        const code = error instanceof Error && error.message.includes("checksum")
          ? "IMPORT_CHECKSUM_FAILED"
          : "IMPORT_INVALID";
        return reply.code(400).send({
          code,
          message: code === "IMPORT_CHECKSUM_FAILED"
            ? "Package checksum does not match"
            : "Encrypted package is invalid"
        });
      }
      if (!bundle?.assessment) {
        return reply.code(400).send({ code: "IMPORT_INVALID", message: "Assessment bundle is invalid" });
      }
      const customerId = randomUUID();
      const assessmentId = randomUUID();
      await pool.query(
        `insert into customers (id, name, industry, regulatory_context, critical_systems, business_criticality, status, created_by_user_id)
         values ($1,$2,$3,$4,$5,$6,'active',$7)`,
        [
          customerId,
          `${bundle.assessment.customer_name} (Imported)`,
          bundle.assessment.industry,
          bundle.assessment.regulatory_context,
          JSON.stringify(bundle.assessment.critical_systems ?? []),
          bundle.assessment.business_criticality,
          request.user!.sub
        ]
      );
      await pool.query(
        `insert into assessments (id, customer_id, type, audience, framework, language, target_date, status, scope)
         values ($1,$2,$3,$4,$5,$6,$7,'imported',$8)`,
        [
          assessmentId,
          customerId,
          bundle.assessment.type,
          bundle.assessment.audience,
          bundle.assessment.framework,
          bundle.assessment.language,
          bundle.assessment.target_date,
          JSON.stringify(bundle.assessment.scope ?? {})
        ]
      );
      for (const finding of bundle.findings ?? []) {
        await pool.query(
          `insert into findings (id, assessment_id, title, status, priority, observation, recommendation, source_explanation, accepted_risk)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            assessmentId,
            finding.title,
            finding.status,
            finding.priority,
            finding.observation,
            finding.recommendation,
            finding.source_explanation,
            finding.accepted_risk
          ]
        );
      }
      for (const risk of bundle.risks ?? []) {
        await pool.query(
          `insert into risks (id, assessment_id, title, likelihood, impact, risk_score, rating, treatment_option, owner, treatment_plan, due_date, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            randomUUID(),
            assessmentId,
            risk.title,
            risk.likelihood,
            risk.impact,
            risk.risk_score,
            risk.rating,
            risk.treatment_option,
            risk.owner,
            risk.treatment_plan,
            risk.due_date,
            risk.status
          ]
        );
      }
      for (const roadmapItem of bundle.roadmapItems ?? []) {
        await pool.query(
          `insert into roadmap_items
            (id, assessment_id, phase, action, owner, due_date, effort_estimate, status, source_risk_rating)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            assessmentId,
            roadmapItem.phase,
            roadmapItem.action,
            roadmapItem.owner,
            roadmapItem.due_date,
            roadmapItem.effort_estimate,
            roadmapItem.status,
            roadmapItem.source_risk_rating
          ]
        );
      }
      for (const report of bundle.reports ?? []) {
        await pool.query(
          `insert into reports
            (id, assessment_id, template_id, created_by, status, content, author_info, selected_blocks, html_preview, report_version)
           values ($1,$2,null,$3,$4,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            assessmentId,
            request.user!.sub,
            report.status ?? "draft",
            JSON.stringify(report.content ?? {}),
            JSON.stringify(report.authorInfo ?? {}),
            JSON.stringify(report.selectedBlocks ?? []),
            report.htmlPreview ?? null,
            report.reportVersion ?? 1
          ]
        );
      }
      await ensureBucket();
      for (const evidence of bundle.evidenceFiles ?? []) {
        const evidenceId = randomUUID();
        const objectKey = `evidence/${assessmentId}/${evidenceId}/${evidence.fileName}`;
        const content = Buffer.from(evidence.contentBase64, "base64");
        await storageClient.putObject(storageBucket(), objectKey, content, content.length, {
          "Content-Type": evidence.mimeType
        });
        await pool.query(
          `insert into evidence_items (id, assessment_id, uploaded_by, object_key, file_name, mime_type, file_size, notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            evidenceId,
            assessmentId,
            request.user!.sub,
            objectKey,
            evidence.fileName,
            evidence.mimeType,
            content.length,
            evidence.notes
          ]
        );
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "assessment.imported",
        entityType: "assessment",
        entityId: assessmentId,
        before: null,
        after: { assessmentId, customerId, source: "cisoassess" }
      });
      return reply.code(201).send({ customerId, assessmentId });
    }
  );
}
