/**
 * Minimal RFC4180-style CSV parser. No external dependency.
 * Handles UTF-8 BOM, auto-delimiter (comma vs semicolon), quoted fields with
 * embedded newlines, escaped quotes (""), trims trailing whitespace.
 * Comment lines starting with `#` are skipped.
 */

export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  delimiter: "," | ";";
  header: string[];
  rows: CsvRow[];
};

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const comma = (firstLine.match(/,/g) ?? []).length;
  const semicolon = (firstLine.match(/;/g) ?? []).length;
  return semicolon > comma ? ";" : ",";
}

function parseRows(text: string, delimiter: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(field);
      field = "";
      result.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    result.push(row);
  }
  return result;
}

export function parseCsv(raw: string): CsvParseResult {
  const text = stripBom(raw);
  const delimiter = detectDelimiter(text);
  const lines = parseRows(text, delimiter)
    .filter((line) => line.length > 0)
    .filter((line) => !(line.length === 1 && line[0].trim() === ""))
    .filter((line) => !line[0].trim().startsWith("#"));
  if (lines.length === 0) {
    return { delimiter, header: [], rows: [] };
  }
  const header = lines[0].map((cell) => cell.trim().toLowerCase());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = (line[c] ?? "").trim();
    }
    rows.push(row);
  }
  return { delimiter, header, rows };
}

export type CsvControlInput = {
  control_id: string;
  title: string;
  requirement: string;
  domain?: string;
  weight?: number;
  tags?: string[];
  source_reference?: string;
};

export type CsvValidationIssue = {
  row: number;
  field?: string;
  message: string;
};

const REQUIRED_COLUMNS = ["control_id", "title", "requirement"] as const;

export function validateCsv(parsed: CsvParseResult): { items: CsvControlInput[]; issues: CsvValidationIssue[] } {
  const issues: CsvValidationIssue[] = [];
  for (const required of REQUIRED_COLUMNS) {
    if (!parsed.header.includes(required)) {
      issues.push({ row: 0, field: required, message: `Pflicht-Spalte '${required}' fehlt im Header.` });
    }
  }
  if (issues.length > 0) return { items: [], issues };

  const seenIds = new Set<string>();
  const items: CsvControlInput[] = [];
  parsed.rows.forEach((row, index) => {
    const lineNumber = index + 2; // header + 1-based
    const controlId = row.control_id?.trim();
    const title = row.title?.trim();
    const requirement = row.requirement?.trim();
    if (!controlId) issues.push({ row: lineNumber, field: "control_id", message: "control_id fehlt." });
    if (!title) issues.push({ row: lineNumber, field: "title", message: "title fehlt." });
    if (!requirement) issues.push({ row: lineNumber, field: "requirement", message: "requirement fehlt." });
    if (!controlId || !title || !requirement) return;
    if (seenIds.has(controlId)) {
      issues.push({ row: lineNumber, field: "control_id", message: `Doppelte control_id '${controlId}'.` });
      return;
    }
    seenIds.add(controlId);
    const weightRaw = Number(row.weight);
    const weight = Number.isFinite(weightRaw) && weightRaw >= 1 && weightRaw <= 3 ? Math.round(weightRaw) : undefined;
    const tags = row.tags
      ? row.tags
          .split(/[;,]/)
          .map((value) => value.trim())
          .filter(Boolean)
      : undefined;
    items.push({
      control_id: controlId,
      title,
      requirement,
      domain: row.domain || undefined,
      weight,
      tags,
      source_reference: row.source_reference || undefined
    });
  });
  return { items, issues };
}

export const CSV_TEMPLATE = `control_id,domain,title,requirement,weight,tags,source_reference
A.5.1,Organisational,Policies for information security,"The organization shall define, approve, communicate and review information security policies.",3,policy;governance,
A.5.2,Organisational,Information security roles and responsibilities,Information security roles and responsibilities shall be defined and allocated.,2,roles;responsibility,
A.5.18,Access control,Privileged access management,Privileged access rights shall be allocated and used in a restricted and managed way.,3,access;privilege,
`;
