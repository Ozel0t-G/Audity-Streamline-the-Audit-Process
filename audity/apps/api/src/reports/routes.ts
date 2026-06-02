import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { reportQueue } from "../jobs/queue.js";
import { pool } from "../db/client.js";
import { ensureBucket, signedGetUrl, storageBucket, storageClient } from "../storage/service.js";

type BrandingBody = {
  logoObjectKey?: string;
  logoFileName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  coverStyle?: string;
  headerText?: string;
  footerText?: string;
  confidentialityLabel?: string;
  watermark?: string;
};

type ReportBody = {
  templateId?: string | null;
  selectedBlocks?: string[];
  authorInfo?: {
    name?: string;
    role?: string;
    email?: string;
    organization?: string;
    date?: string;
  };
};

const defaultBlocks = [
  "Cover",
  "Executive Summary",
  "Scope",
  "Maturity Overview",
  "Framework Readiness",
  "Top Risks",
  "Detailed Findings",
  "Risk Register",
  "Roadmap",
  "Appendix"
];

function mapBranding(row: Record<string, unknown> | undefined) {
  return {
    id: row?.id ?? null,
    logoObjectKey: row?.logo_object_key ?? null,
    logoFileName: row?.logo_file_name ?? null,
    primaryColor: row?.primary_color ?? "#008CFF",
    secondaryColor: row?.secondary_color ?? "#061E3A",
    accentColor: row?.accent_color ?? "#2ECC71",
    coverStyle: row?.cover_style ?? "executive",
    headerText: row?.header_text ?? "Audity Assessment Report",
    footerText: row?.footer_text ?? "Confidential",
    confidentialityLabel: row?.confidentiality_label ?? "Confidential",
    watermark: row?.watermark ?? ""
  };
}

function mapReport(row: Record<string, unknown>) {
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    templateId: row.template_id,
    createdBy: row.created_by,
    status: row.status,
    content: row.content,
    authorInfo: row.author_info,
    selectedBlocks: row.selected_blocks,
    htmlPreview: row.html_preview,
    pdfObjectKey: row.pdf_object_key,
    exportedAt: row.exported_at,
    reportVersion: row.report_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadBranding() {
  const result = await pool.query("select * from report_branding order by updated_at desc limit 1");
  return mapBranding(result.rows[0]);
}

async function buildReportHtml(assessmentId: string, blocks: string[], authorInfo: ReportBody["authorInfo"]) {
  const [assessment, findings, risks, roadmap, brandingResult] = await Promise.all([
    pool.query(
      `select a.*, c.name as customer_name, c.industry, c.regulatory_context
       from assessments a join customers c on c.id = a.customer_id
       where a.id = $1`,
      [assessmentId]
    ),
    pool.query("select * from findings where assessment_id = $1 order by created_at desc", [assessmentId]),
    pool.query("select * from risks where assessment_id = $1 order by risk_score desc nulls last", [assessmentId]),
    pool.query("select * from roadmap_items where assessment_id = $1 order by phase, created_at", [assessmentId]),
    pool.query("select * from report_branding order by updated_at desc limit 1")
  ]);
  if (!assessment.rows[0]) {
    throw new Error("Assessment not found");
  }
  const branding = mapBranding(brandingResult.rows[0]);
  const selected = blocks.length ? blocks : defaultBlocks;
  const row = assessment.rows[0];
  const section = (name: string, body: string) =>
    selected.includes(name) ? `<section><h2>${escapeHtml(name)}</h2>${body}</section>` : "";

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; color: #1f2937; margin: 36px; }
        header { border-bottom: 4px solid ${branding.primaryColor}; padding-bottom: 18px; margin-bottom: 24px; }
        h1 { color: ${branding.secondaryColor}; margin: 0 0 8px; }
        h2 { color: ${branding.secondaryColor}; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
        .label { color: ${branding.primaryColor}; font-weight: 700; text-transform: uppercase; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
        .confidential { color: ${branding.accentColor}; font-weight: 700; }
        footer { margin-top: 36px; color: #6b7280; font-size: 11px; }
      </style>
    </head>
    <body>
      <header>
        <p class="label">${escapeHtml(branding.confidentialityLabel)}</p>
        <h1>${escapeHtml(branding.headerText)}</h1>
        <p>${escapeHtml(row.customer_name)} · ${escapeHtml(row.type)} · Version 1</p>
      </header>
      ${section("Cover", `<p>Customer: ${escapeHtml(row.customer_name)}</p><p>Industry: ${escapeHtml(row.industry)}</p>`)}
      ${section("Executive Summary", `<p>This report summarizes assessment scope, maturity signals, findings, risks, and roadmap actions generated in Audity.</p>`)}
      ${section("Scope", `<pre>${escapeHtml(JSON.stringify(row.scope, null, 2))}</pre>`)}
      ${section("Maturity Overview", `<p>Status: ${escapeHtml(row.status)} · Framework: ${escapeHtml(row.framework)}</p>`)}
      ${section("Framework Readiness", `<p>${findings.rowCount} findings and ${risks.rowCount} risks are currently tracked.</p>`)}
      ${section("Top Risks", `<table><tr><th>Risk</th><th>Rating</th><th>Score</th></tr>${risks.rows.slice(0, 5).map((risk) => `<tr><td>${escapeHtml(risk.title)}</td><td>${escapeHtml(risk.rating)}</td><td>${escapeHtml(risk.risk_score)}</td></tr>`).join("")}</table>`)}
      ${section("Detailed Findings", `<table><tr><th>Finding</th><th>Status</th><th>Priority</th></tr>${findings.rows.map((finding) => `<tr><td>${escapeHtml(finding.title)}</td><td>${escapeHtml(finding.status)}</td><td>${escapeHtml(finding.priority)}</td></tr>`).join("")}</table>`)}
      ${section("Risk Register", `<table><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Rating</th></tr>${risks.rows.map((risk) => `<tr><td>${escapeHtml(risk.title)}</td><td>${escapeHtml(risk.likelihood)}</td><td>${escapeHtml(risk.impact)}</td><td>${escapeHtml(risk.rating)}</td></tr>`).join("")}</table>`)}
      ${section("Roadmap", `<table><tr><th>Phase</th><th>Action</th><th>Owner</th></tr>${roadmap.rows.map((item) => `<tr><td>${escapeHtml(item.phase)}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.owner)}</td></tr>`).join("")}</table>`)}
      ${section("Appendix", `<p>Generated ${escapeHtml(new Date().toISOString())}</p>`)}
      <footer>
        <p class="confidential">${escapeHtml(branding.footerText)}</p>
        <p>Author: ${escapeHtml(authorInfo?.name)} · ${escapeHtml(authorInfo?.role)} · ${escapeHtml(authorInfo?.email)} · ${escapeHtml(authorInfo?.organization)} · ${escapeHtml(authorInfo?.date)}</p>
      </footer>
    </body>
  </html>`;
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/branding", { preHandler: requirePermission("branding.manage") }, async () => ({
    branding: await loadBranding()
  }));

  app.put<{ Body: BrandingBody }>(
    "/api/admin/branding",
    { preHandler: requireCsrfPermission("branding.manage") },
    async (request) => {
      const id = randomUUID();
      const result = await pool.query(
        `insert into report_branding
          (id, logo_object_key, logo_file_name, primary_color, secondary_color, accent_color,
           cover_style, header_text, footer_text, confidentiality_label, watermark)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         returning *`,
        [
          id,
          request.body.logoObjectKey ?? null,
          request.body.logoFileName ?? null,
          request.body.primaryColor ?? "#008CFF",
          request.body.secondaryColor ?? "#061E3A",
          request.body.accentColor ?? "#2ECC71",
          request.body.coverStyle ?? "executive",
          request.body.headerText ?? "Audity Assessment Report",
          request.body.footerText ?? "Confidential",
          request.body.confidentialityLabel ?? "Confidential",
          request.body.watermark ?? ""
        ]
      );
      return { branding: mapBranding(result.rows[0]) };
    }
  );

  app.post(
    "/api/admin/branding/logo",
    { preHandler: requireCsrfPermission("branding.manage") },
    async (request, reply) => {
      const file = await request.file({ limits: { fileSize: 5 * 1024 * 1024 } });
      if (!file) {
        return reply.code(400).send({ code: "FILE_REQUIRED", message: "Logo file is required" });
      }
      if (!["image/png", "image/jpeg"].includes(file.mimetype)) {
        return reply.code(400).send({ code: "FILE_TYPE_BLOCKED", message: "Logo must be PNG or JPEG" });
      }
      await ensureBucket();
      const id = randomUUID();
      const objectKey = `branding/${id}/${file.filename}`;
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
      return {
        logoObjectKey: objectKey,
        logoFileName: file.filename,
        previewUrl: await signedGetUrl(objectKey)
      };
    }
  );

  app.post<{ Params: { id: string }; Body: ReportBody }>(
    "/api/assessments/:id/reports",
    { preHandler: requireCsrfPermission("report.export") },
    async (request, reply) => {
      const blocks = request.body.selectedBlocks ?? defaultBlocks;
      const html = await buildReportHtml(request.params.id, blocks, request.body.authorInfo);
      const result = await pool.query(
        `insert into reports
          (id, assessment_id, template_id, created_by, status, content, author_info, selected_blocks, html_preview)
         values ($1,$2,$3,$4,'draft',$5,$6,$7,$8)
         returning *`,
        [
          randomUUID(),
          request.params.id,
          request.body.templateId ?? null,
          request.user!.sub,
          JSON.stringify({ generatedAt: new Date().toISOString() }),
          JSON.stringify(request.body.authorInfo ?? {}),
          JSON.stringify(blocks),
          html
        ]
      );
      return reply.code(201).send({ report: mapReport(result.rows[0]) });
    }
  );

  app.get<{ Params: { id: string; reportId: string } }>(
    "/api/assessments/:id/reports/:reportId/preview",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      const result = await pool.query(
        "select * from reports where id = $1 and assessment_id = $2",
        [request.params.reportId, request.params.id]
      );
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "REPORT_NOT_FOUND", message: "Report not found" });
      }
      reply.header("Content-Type", "text/html; charset=utf-8");
      return result.rows[0].html_preview;
    }
  );

  app.post<{ Params: { id: string; reportId: string } }>(
    "/api/assessments/:id/reports/:reportId/export",
    { preHandler: requireCsrfPermission("report.export") },
    async (request, reply) => {
      const report = await pool.query(
        "select id from reports where id = $1 and assessment_id = $2",
        [request.params.reportId, request.params.id]
      );
      if (!report.rows[0]) {
        return reply.code(404).send({ code: "REPORT_NOT_FOUND", message: "Report not found" });
      }
      const job = await reportQueue.add("export-report-pdf", {
        assessmentId: request.params.id,
        reportId: request.params.reportId,
        userId: request.user!.sub
      });
      await pool.query("update reports set status = 'queued', updated_at = now() where id = $1", [
        request.params.reportId
      ]);
      return reply.code(202).send({ jobId: job.id });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/jobs/:id/status",
    { preHandler: requirePermission("assessment.view") },
    async (request) => {
      const job = await reportQueue.getJob(request.params.id);
      if (!job) {
        return { id: request.params.id, status: "not_found" };
      }
      const state = await job.getState();
      const returnValue = job.returnvalue as { objectKey?: string } | null;
      return {
        id: job.id,
        status: state,
        progress: job.progress,
        failedReason: job.failedReason,
        downloadUrl: returnValue?.objectKey ? await signedGetUrl(returnValue.objectKey) : null
      };
    }
  );

  app.get<{ Params: { id: string; reportId: string } }>(
    "/api/assessments/:id/reports/:reportId/download",
    { preHandler: requirePermission("report.export") },
    async (request, reply) => {
      const result = await pool.query(
        "select pdf_object_key from reports where id = $1 and assessment_id = $2",
        [request.params.reportId, request.params.id]
      );
      if (!result.rows[0]?.pdf_object_key) {
        return reply.code(404).send({ code: "REPORT_PDF_NOT_FOUND", message: "Report PDF not found" });
      }
      return { downloadUrl: await signedGetUrl(result.rows[0].pdf_object_key) };
    }
  );
}
