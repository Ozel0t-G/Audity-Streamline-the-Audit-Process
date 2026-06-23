/*
 * Generates the Audity security review report as a PDF, using the application's
 * own locally-installed pdfkit (same renderer the app uses for audit PDFs).
 * Run from the repo root:  node scripts/security-report.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const PRIMARY = "#3b6eea";
const SEV = {
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
  info: "#0891b2",
  ok: "#16a34a"
};

const REPORT = {
  title: "Sicherheitsbericht",
  subtitle: "Audity — Streamline the Audit Process",
  scope:
    "Code-gestützte Sicherheitsanalyse der lokalen Installation (Branch main). Schwerpunkte: " +
    "Authentifizierung, Mandanten-/Zugriffskontrolle, Token-Handling, SQL-Injection, " +
    "Secrets-Management, CSRF/XSS und Datenintegrität.",
  findings: [
    {
      id: "F-01",
      sev: "high",
      title: "Cross-Tenant IDOR in den Framework-Suggestion-Routen",
      status: "Behoben",
      location: "apps/api/src/cockpit/transitions.ts",
      desc:
        "Die Routen GET /api/customers/:id/framework-suggestions und POST " +
        "/api/customers/:id/framework-suggestions/:frameworkId/deprecate operierten auf " +
        "customer_id = :id, prüften aber nur die Permission (assessment.view / assessment.edit) " +
        "und nie canAccessCustomer. In dieser Multi-Tenant-App konnte dadurch jeder Nutzer mit " +
        "der Permission fremde Kunden-Frameworks auslesen bzw. per deprecate verändern — ein " +
        "horizontaler Berechtigungsdurchbruch (IDOR).",
      impact:
        "Lese- und Schreibzugriff auf Datensätze fremder Mandanten (Vertraulichkeit & Integrität).",
      fix:
        "Beide Routen erhalten vor der DB-Operation den canAccessCustomer-Check (404 bei " +
        "fehlendem Zugriff) — konsistent zu allen übrigen /api/customers/:id-Routen."
    },
    {
      id: "F-02",
      sev: "medium",
      title: "TOCTOU-Race im Customer-Acknowledgement-Redeem",
      status: "Behoben",
      location: "apps/api/src/customerAck/routes.ts, tokens.ts",
      desc:
        "Zwischen der Statusprüfung (status !== 'pending') und markTokenRedeemed lag ein " +
        "Time-of-check/Time-of-use-Fenster. markTokenRedeemed aktualisierte das Token " +
        "bedingungslos, sodass zwei gleichzeitige Redeem-Requests (doppelter Submit-Klick / " +
        "Retry) beide den Gate passierten und je einen audit_signoffs-Eintrag erzeugten.",
      impact:
        "Doppelte / inkonsistente Kunden-Sign-offs für ein einzelnes Token (Datenintegrität, " +
        "Beweiskraft des Audit-Trails).",
      fix:
        "markTokenRedeemed claimt das Token jetzt atomar per guarded UPDATE " +
        "(redeemed_at is null AND revoked_at is null AND expires_at > now()) und gibt zurück, " +
        "ob es gewonnen hat. Die Route claimt VOR dem Insert und bricht mit HTTP 410 ab, wenn " +
        "sie das Race verliert."
    },
    {
      id: "O-01",
      sev: "info",
      title: "Hash-Chain des Activity-Logs nicht serialisiert",
      status: "Beobachtung (offen)",
      location: "apps/api/src/customerAck/expiryJob.ts",
      desc:
        "Der Expiry-Job liest den prev_hash des letzten Log-Eintrags und schreibt anschließend " +
        "einen neuen Eintrag — nicht atomar. Unter gleichzeitigen Schreibvorgängen aus anderen " +
        "Quellen kann die manipulationssichere Hash-Kette verzweigen.",
      impact:
        "Geringe Wahrscheinlichkeit; betrifft die Lückenlosigkeit der Tamper-Evidence-Kette, " +
        "nicht die Vertraulichkeit.",
      fix:
        "Empfehlung: Activity-Log-Appends serialisieren (Postgres Advisory Lock oder einzelner " +
        "Writer), damit prev_hash → event_hash konfliktfrei verkettet."
    }
  ],
  strengths: [
    "Passwort-Hashing durchgängig mit argon2id (Login, Passwortwechsel, MFA-Recovery-Codes).",
    "Admin-seitig generierte Einmalpasswörter: 24 Zeichen, garantierte Komplexität, CSPRNG.",
    "JWT signiert mit App-Secret; Auth-Cookies httpOnly + SameSite=strict.",
    "CSRF-Token-Validierung auf allen mutierenden Routen (requireCsrfPermission).",
    "Redis-gestütztes Rate-Limiting auf Auth-Endpunkten und Portal-Routen.",
    "Durchgängig parametrisierte SQL-Queries — keine Injection-Vektoren gefunden.",
    "Keine eval/child_process/exec; kein dangerouslySetInnerHTML/innerHTML im Frontend.",
    "Keine hartkodierten Secrets; Produktions-Config verweigert Start bei Default-/schwachen " +
      "Secrets (<32 Zeichen) und erzwingt getrennten Encryption-Key.",
    "Pinned-Snapshot + event_hash sichern Berichtsstand und Sign-off-Nachweise revisionssicher."
  ]
};

function generate(outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(outPath);
    stream.on("finish", () => resolve(outPath));
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const left = 50;
    const contentW = pageW - 100;

    const ensureSpace = (needed) => {
      if (doc.y > doc.page.height - needed) doc.addPage();
    };

    // ─── Header banner ───────────────────────────────────────
    doc.rect(0, 0, pageW, 96).fill(PRIMARY);
    doc.fillColor("white").fontSize(22).text(REPORT.title, left, 26);
    doc.fillColor("#e0e7ff").fontSize(11).text(REPORT.subtitle, left, 56);
    doc.fillColor("#dbeafe").fontSize(9).text(
      `Erstellt am ${new Date().toLocaleString("de-DE")} · Branch main · vertraulich`,
      left,
      74
    );

    // ─── Scope ───────────────────────────────────────────────
    doc.y = 120;
    doc.fillColor("#111").fontSize(13).text("Umfang", { underline: true });
    doc.moveDown(0.3);
    doc.fillColor("#374151").fontSize(10).text(REPORT.scope, { width: contentW });
    doc.moveDown(0.9);

    // ─── Summary counts ──────────────────────────────────────
    const counts = REPORT.findings.reduce(
      (acc, f) => ({ ...acc, [f.sev]: (acc[f.sev] || 0) + 1 }),
      {}
    );
    doc.fillColor("#111").fontSize(13).text("Zusammenfassung", { underline: true });
    doc.moveDown(0.3);
    const cards = [
      ["HOCH", counts.high || 0, SEV.high],
      ["MITTEL", counts.medium || 0, SEV.medium],
      ["NIEDRIG", counts.low || 0, SEV.low],
      ["INFO", counts.info || 0, SEV.info]
    ];
    const cardW = (contentW - 18) / 4;
    const cardY = doc.y;
    cards.forEach(([label, n, color], i) => {
      const x = left + i * (cardW + 6);
      doc.rect(x, cardY, cardW, 46).fillAndStroke(color + "18", color);
      doc.fillColor(color).fontSize(8).text(label, x + 8, cardY + 7);
      doc.fillColor("#111").fontSize(20).text(String(n), x + 8, cardY + 18);
    });
    doc.y = cardY + 60;
    doc.fillColor("#6b7280").fontSize(9).text(
      "2 Befunde wurden im Zuge dieser Analyse direkt behoben (siehe Status). " +
        "1 Beobachtung ist als Empfehlung offen.",
      { width: contentW }
    );
    doc.moveDown(1);

    // ─── Findings ────────────────────────────────────────────
    doc.fillColor("#111").fontSize(13).text("Befunde", { underline: true });
    doc.moveDown(0.5);

    REPORT.findings.forEach((f) => {
      ensureSpace(150);
      const color = SEV[f.sev] || "#9ca3af";
      const top = doc.y;

      // severity rail + id/title row
      doc.rect(left, top, 4, 16).fill(color);
      doc.fillColor(color).fontSize(9).text(
        `${f.id} · ${labelFor(f.sev)} · ${f.status}`,
        left + 12,
        top + 2
      );
      doc.fillColor("#111").fontSize(12).text(f.title, left + 12, doc.y + 2, {
        width: contentW - 12
      });
      doc.moveDown(0.2);
      doc.fillColor("#6b7280").fontSize(8).text(f.location, left + 12, doc.y, {
        width: contentW - 12
      });
      doc.moveDown(0.4);

      field(doc, "Beschreibung", f.desc, left + 12, contentW - 12);
      field(doc, "Auswirkung", f.impact, left + 12, contentW - 12);
      field(doc, "Maßnahme", f.fix, left + 12, contentW - 12);
      doc.moveDown(0.8);
    });

    // ─── Strengths ───────────────────────────────────────────
    ensureSpace(120);
    doc.fillColor("#111").fontSize(13).text("Positiv bewertete Kontrollen", { underline: true });
    doc.moveDown(0.4);
    REPORT.strengths.forEach((s) => {
      ensureSpace(40);
      const y = doc.y;
      doc.fillColor(SEV.ok).fontSize(10).text("✓", left, y);
      doc.fillColor("#374151").fontSize(10).text(s, left + 16, y, { width: contentW - 16 });
      doc.moveDown(0.3);
    });

    // ─── Footer on every page ────────────────────────────────
    const range = doc.bufferedPageRange ? doc.bufferedPageRange() : { start: 0, count: 1 };
    doc.end();

    function field(d, label, value, x, w) {
      ensureSpace(50);
      d.fillColor("#111").fontSize(9).text(label, x, d.y, { continued: false });
      d.fillColor("#374151").fontSize(9.5).text(value, x, d.y, { width: w });
      d.moveDown(0.25);
    }
  });
}

function labelFor(sev) {
  return { high: "HOCH", medium: "MITTEL", low: "NIEDRIG", info: "INFO" }[sev] || sev.toUpperCase();
}

const out = path.join(__dirname, "..", `Audity-Sicherheitsbericht-${new Date().toISOString().slice(0, 10)}.pdf`);
generate(out)
  .then((p) => console.log("PDF erstellt:", p))
  .catch((e) => {
    console.error("Fehler:", e);
    process.exit(1);
  });
