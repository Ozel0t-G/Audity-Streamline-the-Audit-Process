import PDFDocument from "pdfkit";
import type { PinnedSnapshot } from "./tokens.js";

export type SnapshotPdfInput = {
  snapshot: PinnedSnapshot;
  message: string | null;
  recipientEmail: string;
  branding: { primaryColor?: string; headerText?: string; footerText?: string };
};

const TIER_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a"
};

export function renderSnapshotPdf(input: SnapshotPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk as Buffer));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const primary = input.branding.primaryColor ?? "#3b6eea";
      const { snapshot } = input;

      // ─── Header banner ─────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(primary);
      doc.fillColor("white").fontSize(18).text(
        input.branding.headerText ?? "Audit Report Summary",
        50,
        24
      );
      doc.fillColor("#e0e7ff").fontSize(10).text(
        `Pinned report version ${snapshot.reportVersion} · captured ${new Date(snapshot.capturedAt).toUTCString()}`,
        50,
        50
      );
      doc.fillColor("#dbeafe").fontSize(9).text(
        `For ${input.recipientEmail}`,
        50,
        66
      );

      // ─── Customer / audit title ────────────────────────────
      doc.y = 120;
      doc.fillColor("#111").fontSize(20).text(snapshot.customerName);
      doc.fontSize(12).fillColor("#374151").text(
        `${snapshot.assessmentType} · completed by ${snapshot.auditorName}`
      );
      doc.moveDown(0.8);

      // ─── Auditor message ───────────────────────────────────
      if (input.message) {
        doc.fillColor("#111").fontSize(11).text("Message from the auditor", { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor("#374151").text(input.message);
        doc.moveDown(0.8);
      }

      // ─── Stats row ─────────────────────────────────────────
      doc.fillColor("#111").fontSize(11).text("Audit overview", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#374151");
      doc.text(`Controls: ${snapshot.controlCount}`);
      doc.text(`Scope items: ${snapshot.scopeItemCount}`);
      doc.text(`Readiness at issue: ${snapshot.readinessScore}%`);
      doc.text(`Findings: ${snapshot.findings.length}`);
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#6b7280").text(snapshot.executiveSummary);
      doc.moveDown(0.8);

      // ─── Severity counts ───────────────────────────────────
      const counts = snapshot.findings.reduce(
        (acc, f) => ({ ...acc, [f.severityTier]: acc[f.severityTier] + 1 }),
        { critical: 0, high: 0, medium: 0, low: 0 }
      );
      doc.fillColor("#111").fontSize(11).text("Findings by severity", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10);
      const startY = doc.y;
      const colWidth = (doc.page.width - 100) / 4;
      const tiers: Array<keyof typeof counts> = ["critical", "high", "medium", "low"];
      tiers.forEach((tier, idx) => {
        const x = 50 + idx * colWidth;
        doc.rect(x, startY, colWidth - 6, 36).fillAndStroke(TIER_COLORS[tier] + "20", TIER_COLORS[tier]);
        doc.fillColor(TIER_COLORS[tier]).fontSize(9).text(tier.toUpperCase(), x + 8, startY + 6);
        doc.fillColor("#111").fontSize(16).text(String(counts[tier]), x + 8, startY + 16);
      });
      doc.y = startY + 50;

      // ─── Findings list (severity ordered) ──────────────────
      doc.fillColor("#111").fontSize(11).text(`All findings (${snapshot.findings.length})`, { underline: true });
      doc.moveDown(0.3);
      for (const finding of snapshot.findings) {
        if (doc.y > doc.page.height - 110) {
          doc.addPage();
        }
        const tierColor = TIER_COLORS[finding.severityTier] ?? "#9ca3af";
        const blockTop = doc.y;
        doc.rect(50, blockTop, doc.page.width - 100, 60)
          .fillAndStroke(tierColor + "10", tierColor + "60");
        doc.fillColor(tierColor).fontSize(9).text(
          finding.severityTier.toUpperCase(),
          60,
          blockTop + 6
        );
        doc.fillColor("#111").fontSize(11).text(finding.title, 60, blockTop + 20, {
          width: doc.page.width - 120
        });
        doc.fillColor("#6b7280").fontSize(8).text(
          `Lifecycle: ${finding.lifecycleStatus ?? "—"} · Response: ${finding.managementResponseStatus ?? "pending"}`,
          60,
          blockTop + 42
        );
        doc.y = blockTop + 70;
      }

      // ─── Footer ────────────────────────────────────────────
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
