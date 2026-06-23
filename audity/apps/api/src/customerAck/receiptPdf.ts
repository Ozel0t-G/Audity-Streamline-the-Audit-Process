import PDFDocument from "pdfkit";
import type { PinnedSnapshot } from "./tokens.js";

export type ReceiptInput = {
  signoffId: string;
  signoffHash: string;
  signerName: string;
  signerEmail: string;
  signerIp: string | null;
  signerUserAgent: string | null;
  statement: string;
  comment: string | null;
  signedAt: string;
  reportVersion: number;
  tokenId: string;
  snapshot: PinnedSnapshot;
  branding: {
    primaryColor?: string;
    headerText?: string;
    footerText?: string;
  };
};

function safeText(value: string | null | undefined): string {
  return value && value.trim().length ? value.trim() : "—";
}

export function renderReceiptPdf(input: ReceiptInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk as Buffer));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const primary = input.branding.primaryColor ?? "#3b6eea";

      // ─── Header banner ────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 80).fill(primary);
      doc.fillColor("white").fontSize(18).text(
        input.branding.headerText ?? "Audit Acknowledgment Receipt",
        50,
        30
      );
      doc.fillColor("#e0e7ff").fontSize(10).text(
        `Powered by Audity · Generated ${new Date().toUTCString()}`,
        50,
        56
      );

      // ─── Title block ──────────────────────────────────────────────
      doc.y = 110;
      doc.fillColor("#111").fontSize(22).text(input.snapshot.customerName);
      doc.fontSize(13).fillColor("#374151").text(
        `${input.snapshot.assessmentType} · completed by ${input.snapshot.auditorName}`
      );
      doc.moveDown(0.5);

      // ─── Acknowledgment summary box ───────────────────────────────
      const boxTop = doc.y;
      doc.rect(50, boxTop, doc.page.width - 100, 110)
        .fillAndStroke("#f0fdf4", "#22c55e");
      doc.fillColor("#166534").fontSize(13).text(
        "✓ Acknowledgment recorded",
        62,
        boxTop + 12
      );
      doc.fillColor("#14532d").fontSize(10);
      doc.text(`Signer: ${safeText(input.signerName)}`, 62, boxTop + 36);
      doc.text(`Email: ${safeText(input.signerEmail)}`, 62, boxTop + 52);
      doc.text(`Signed at: ${new Date(input.signedAt).toUTCString()}`, 62, boxTop + 68);
      doc.text(`IP address: ${safeText(input.signerIp)}`, 62, boxTop + 84);
      doc.y = boxTop + 125;

      // ─── Statement & comment ──────────────────────────────────────
      doc.fillColor("#111").fontSize(11).text("Statement", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#374151").text(input.statement);
      doc.moveDown(0.8);

      if (input.comment) {
        doc.fillColor("#111").fontSize(11).text("Signer's comment", { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor("#374151").text(input.comment);
        doc.moveDown(0.8);
      }

      // ─── Audit context (from frozen snapshot) ────────────────────
      doc.fillColor("#111").fontSize(11).text("Audit context (pinned at issue time)", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#374151");
      doc.text(`Report version: ${input.snapshot.reportVersion}`);
      doc.text(`Snapshot captured: ${new Date(input.snapshot.capturedAt).toUTCString()}`);
      doc.text(`Controls: ${input.snapshot.controlCount}`);
      doc.text(`Scope items: ${input.snapshot.scopeItemCount}`);
      doc.text(`Readiness at issue: ${input.snapshot.readinessScore}%`);
      doc.moveDown(0.5);

      // ─── Findings summary ─────────────────────────────────────────
      const counts = input.snapshot.findings.reduce(
        (acc, f) => ({ ...acc, [f.severityTier]: acc[f.severityTier] + 1 }),
        { critical: 0, high: 0, medium: 0, low: 0 }
      );
      doc.fillColor("#111").fontSize(11).text(`Findings (${input.snapshot.findings.length})`, { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#374151");
      doc.text(
        `Critical: ${counts.critical}  ·  High: ${counts.high}  ·  Medium: ${counts.medium}  ·  Low: ${counts.low}`
      );
      doc.moveDown(0.8);

      // ─── Forensic footer ──────────────────────────────────────────
      const footerTop = doc.page.height - 110;
      doc.rect(50, footerTop, doc.page.width - 100, 60)
        .fillAndStroke("#f3f4f6", "#d1d5db");
      doc.fillColor("#374151").fontSize(8);
      doc.text("Tamper-evident record", 62, footerTop + 8);
      doc.fillColor("#6b7280").fontSize(7);
      doc.text(`Signoff ID: ${input.signoffId}`, 62, footerTop + 22);
      doc.text(`Token ID: ${input.tokenId}`, 62, footerTop + 32);
      doc.text(`Event hash (SHA-256): ${input.signoffHash}`, 62, footerTop + 42, {
        width: doc.page.width - 140
      });

      doc.fillColor("#9ca3af").fontSize(7).text(
        input.branding.footerText
          ? `${input.branding.footerText} · Powered by Audity`
          : "Powered by Audity",
        50,
        doc.page.height - 40,
        { align: "center", width: doc.page.width - 100 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
