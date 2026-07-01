import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { stringify as yamlStringify } from "yaml";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";
import { sha256 } from "../utils/crypto.js";
import { syncFrameworkYamlFiles } from "./yamlImporter.js";
import { createLlmProvider, estimateCostCents } from "../llm/provider.js";
import { loadLlmConfigInternal } from "../llm/settings.js";
import { isEntitled } from "../license/entitlement.js";
import { licenseService } from "../license/service.js";
import {
  parseCsv,
  validateCsv,
  type CsvControlInput,
  type CsvValidationIssue
} from "./csvParser.js";

export type DraftControl = {
  id: string;
  title: string;
  weight: number;
  answerType: "scale";
  tags: string[];
  question: string;
  purpose: string;
  expectedOutcome: string[];
  howTo: Array<{ step: string; details?: string }>;
  evidenceExamples: string[];
  scoring: {
    scale: string;
    passWhen: string;
    gapWhen: string;
  };
  _source?: {
    requirement: string;
    sourceReference?: string;
  };
  _approved?: boolean;
  _todo?: boolean;
};

export type DraftDomain = {
  id?: string;
  name: string;
  description?: string;
  controls: DraftControl[];
};

export type DraftYaml = {
  framework: {
    schemaVersion: 1;
    key: string;
    name: string;
    version: string;
    status: "draft" | "published";
    language: "de" | "en";
    source: "user_uploaded";
    importMeta: {
      sourceFile: string;
      importedAt: string;
      importedBy: string;
      llmProvider: string | null;
      llmModel: string | null;
    };
    description?: string;
  };
  domains: DraftDomain[];
};

function userSourcesDir(): string {
  return absolutize(loadConfig().userSourcesDirectory);
}

function userYamlDir(): string {
  return absolutize(loadConfig().userYamlDirectory);
}

function absolutize(value: string): string {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "framework";
}

export async function persistSourceFile(buffer: Buffer, originalName: string): Promise<{ path: string }> {
  const dir = userSourcesDir();
  await mkdir(dir, { recursive: true });
  const datePrefix = new Date().toISOString().slice(0, 10);
  const safeName = originalName.replace(/[^\w.-]+/g, "_").slice(-160) || "upload.csv";
  const path = resolve(dir, `${datePrefix}_${randomUUID().slice(0, 8)}_${safeName}`);
  await writeFile(path, buffer);
  return { path };
}

export type CreateImportInput = {
  uploadedBy: string;
  sourceFilename: string;
  sourceMime: string;
  sourcePath: string;
  frameworkKey: string;
  frameworkName: string;
  frameworkVersion: string;
  frameworkLanguage: "de" | "en";
};

export type ImportRecord = {
  id: string;
  uploaded_by: string;
  source_filename: string;
  source_mime: string;
  source_path: string;
  status: string;
  framework_key: string | null;
  framework_name: string | null;
  framework_version: string | null;
  framework_language: string | null;
  draft_yaml: DraftYaml | null;
  llm_provider: string | null;
  llm_model: string | null;
  llm_tokens_in: number;
  llm_tokens_out: number;
  llm_estimated_cost_cents: number;
  total_controls: number;
  enriched_controls: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
  committed_yaml_path: string | null;
};

export type ImportRecordPublic = {
  id: string;
  uploadedBy: string;
  sourceFilename: string;
  sourceMime: string;
  sourcePath: string;
  status: string;
  frameworkKey: string | null;
  frameworkName: string | null;
  frameworkVersion: string | null;
  frameworkLanguage: string | null;
  draftYaml: DraftYaml | null;
  llmProvider: string | null;
  llmModel: string | null;
  llmTokensIn: number;
  llmTokensOut: number;
  llmEstimatedCostCents: number;
  totalControls: number;
  enrichedControls: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  committedAt: string | null;
  committedYamlPath: string | null;
};

export function mapImportRecord(row: ImportRecord): ImportRecordPublic {
  return {
    id: row.id,
    uploadedBy: row.uploaded_by,
    sourceFilename: row.source_filename,
    sourceMime: row.source_mime,
    sourcePath: row.source_path,
    status: row.status,
    frameworkKey: row.framework_key,
    frameworkName: row.framework_name,
    frameworkVersion: row.framework_version,
    frameworkLanguage: row.framework_language,
    draftYaml: row.draft_yaml,
    llmProvider: row.llm_provider,
    llmModel: row.llm_model,
    llmTokensIn: row.llm_tokens_in,
    llmTokensOut: row.llm_tokens_out,
    llmEstimatedCostCents: row.llm_estimated_cost_cents,
    totalControls: row.total_controls,
    enrichedControls: row.enriched_controls,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    committedAt: row.committed_at,
    committedYamlPath: row.committed_yaml_path
  };
}

export async function createImportRecord(input: CreateImportInput): Promise<ImportRecord> {
  const id = randomUUID();
  const result = await pool.query<ImportRecord>(
    `insert into framework_imports
      (id, uploaded_by, source_filename, source_mime, source_path, status,
       framework_key, framework_name, framework_version, framework_language)
     values ($1,$2,$3,$4,$5,'uploaded',$6,$7,$8,$9)
     returning *`,
    [
      id,
      input.uploadedBy,
      input.sourceFilename,
      input.sourceMime,
      input.sourcePath,
      input.frameworkKey,
      input.frameworkName,
      input.frameworkVersion,
      input.frameworkLanguage
    ]
  );
  return result.rows[0];
}

export async function getImportRecord(id: string): Promise<ImportRecord | null> {
  const result = await pool.query<ImportRecord>(
    "select * from framework_imports where id = $1",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function listImports(): Promise<ImportRecord[]> {
  const result = await pool.query<ImportRecord>(
    "select * from framework_imports where status != 'discarded' order by created_at desc limit 100"
  );
  return result.rows;
}

export async function updateImportStatus(
  id: string,
  patch: Partial<{
    status: string;
    draft_yaml: DraftYaml | null;
    llm_provider: string | null;
    llm_model: string | null;
    llm_tokens_in: number;
    llm_tokens_out: number;
    llm_estimated_cost_cents: number;
    total_controls: number;
    enriched_controls: number;
    error_message: string | null;
    committed_at: string | null;
    committed_yaml_path: string | null;
  }>
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = $${idx++}`);
    if (key === "draft_yaml") {
      values.push(value === null ? null : JSON.stringify(value));
    } else {
      values.push(value);
    }
  }
  fields.push("updated_at = now()");
  values.push(id);
  await pool.query(
    `update framework_imports set ${fields.join(", ")} where id = $${idx}`,
    values
  );
}

export type CsvIntakeResult = {
  items: CsvControlInput[];
  issues: CsvValidationIssue[];
};

export async function extractFromCsv(filePath: string): Promise<CsvIntakeResult> {
  const raw = await readFile(filePath, "utf8");
  const parsed = parseCsv(raw);
  return validateCsv(parsed);
}

export function buildSkeletonDraft(options: {
  frameworkKey: string;
  frameworkName: string;
  frameworkVersion: string;
  language: "de" | "en";
  importedBy: string;
  sourceFilename: string;
  controls: CsvControlInput[];
  llmProvider: string | null;
  llmModel: string | null;
}): DraftYaml {
  const domainsMap = new Map<string, DraftDomain>();
  const fallbackDomain = options.frameworkName;
  for (const item of options.controls) {
    const domainName = item.domain?.trim() || fallbackDomain;
    let domain = domainsMap.get(domainName);
    if (!domain) {
      domain = {
        id: slugify(domainName),
        name: domainName,
        controls: []
      };
      domainsMap.set(domainName, domain);
    }
    const todo = options.language === "de"
      ? "TODO: manuell ausfüllen oder über AI generieren."
      : "TODO: fill in manually or generate via AI.";
    domain.controls.push({
      id: item.control_id,
      title: item.title,
      weight: item.weight ?? 2,
      answerType: "scale",
      tags: item.tags ?? [],
      question: todo,
      purpose: todo,
      expectedOutcome: [todo],
      howTo: [{ step: todo }],
      evidenceExamples: [todo],
      scoring: {
        scale: "0-5+NA",
        passWhen: "score >= 4 AND evidenceCount >= 1",
        gapWhen: "score <= 2 OR evidenceCount == 0"
      },
      _source: {
        requirement: item.requirement,
        sourceReference: item.source_reference
      }
    });
  }
  return {
    framework: {
      schemaVersion: 1,
      key: options.frameworkKey,
      name: options.frameworkName,
      version: options.frameworkVersion,
      status: "draft",
      language: options.language,
      source: "user_uploaded",
      importMeta: {
        sourceFile: options.sourceFilename,
        importedAt: new Date().toISOString(),
        importedBy: options.importedBy,
        llmProvider: options.llmProvider,
        llmModel: options.llmModel
      }
    },
    domains: [...domainsMap.values()]
  };
}

export function countControls(draft: DraftYaml): number {
  return draft.domains.reduce((sum, domain) => sum + domain.controls.length, 0);
}

export function stripInternalFields(draft: DraftYaml): DraftYaml {
  return {
    framework: draft.framework,
    domains: draft.domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      description: domain.description,
      controls: domain.controls.map((control) => {
        const clone: DraftControl = { ...control };
        delete clone._source;
        delete clone._approved;
        delete clone._todo;
        return clone;
      })
    }))
  };
}

export function draftToYamlString(draft: DraftYaml): string {
  const cleaned = stripInternalFields(draft);
  return yamlStringify(cleaned, { lineWidth: 0 });
}

export async function commitDraft(record: ImportRecord): Promise<{ path: string }> {
  if (!record.draft_yaml) throw new Error("No draft to commit");
  const yaml = draftToYamlString(record.draft_yaml);
  const dir = userYamlDir();
  await mkdir(dir, { recursive: true });
  const filename = `${slugify(record.framework_key ?? record.framework_name ?? "framework")}-${record.id.slice(0, 8)}.yaml`;
  const targetPath = resolve(dir, filename);
  await writeFile(targetPath, yaml, "utf8");
  await updateImportStatus(record.id, {
    status: "committed",
    committed_at: new Date().toISOString(),
    committed_yaml_path: targetPath
  });
  await syncFrameworkYamlFiles({ force: true }).catch(() => undefined);
  return { path: targetPath };
}

export async function deleteImport(record: ImportRecord, removeSource = true): Promise<void> {
  await updateImportStatus(record.id, { status: "discarded" });
  if (removeSource && record.source_path) {
    await unlink(record.source_path).catch(() => undefined);
  }
}

export async function deleteUserFrameworkYaml(yamlSourcePath: string): Promise<void> {
  const userDir = userYamlDir();
  const absolute = isAbsolute(yamlSourcePath) ? yamlSourcePath : resolve(process.cwd(), yamlSourcePath);
  if (!absolute.startsWith(userDir)) {
    throw new Error("Refusing to delete YAML outside user_frameworks/");
  }
  await unlink(absolute).catch(() => undefined);
}

export function controlSourceHash(control: { _source?: { requirement?: string }; title: string }): string {
  return sha256(`${control.title}|${control._source?.requirement ?? ""}`);
}

// Re-export for use in admin routes
export { ensureSourcesDirExists };

async function ensureSourcesDirExists(): Promise<void> {
  await mkdir(userSourcesDir(), { recursive: true });
  await mkdir(dirname(userSourcesDir()), { recursive: true }).catch(() => undefined);
  await mkdir(userYamlDir(), { recursive: true });
}

const inFlight = new Set<string>();

export function scheduleImport(importId: string): void {
  if (inFlight.has(importId)) return;
  inFlight.add(importId);
  setImmediate(() => {
    processImport(importId)
      .catch(async (error) => {
        await updateImportStatus(importId, {
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error)
        }).catch(() => undefined);
      })
      .finally(() => {
        inFlight.delete(importId);
      });
  });
}

export async function processImport(importId: string): Promise<void> {
  const record = await getImportRecord(importId);
  if (!record) return;
  if (record.status !== "uploaded" && record.status !== "extracting") return;
  await updateImportStatus(importId, { status: "extracting" });

  const intake = await extractFromCsv(record.source_path);
  if (intake.issues.length > 0 || intake.items.length === 0) {
    await updateImportStatus(importId, {
      status: "failed",
      error_message: intake.issues.length
        ? `CSV validation failed: ${intake.issues
            .slice(0, 5)
            .map((issue) => `Zeile ${issue.row} ${issue.field ?? ""}: ${issue.message}`)
            .join("; ")}`
        : "CSV enthält keine gültigen Kontroll-Zeilen."
    });
    return;
  }

  let config = await loadLlmConfigInternal();
  // AI ist ein Paid-Feature: ohne Berechtigung (Free) auf "none" zwingen →
  // Enrichment fällt auf TODO-Platzhalter zurück. Demo/Pro/Enterprise ⇒ AI aktiv.
  if (!isEntitled("ai", licenseService.getState())) {
    config = { ...config, provider: "none" };
  }
  const provider = createLlmProvider(config);
  const language = (record.framework_language ?? "de") as "de" | "en";
  const skeleton = buildSkeletonDraft({
    frameworkKey: record.framework_key ?? "framework",
    frameworkName: record.framework_name ?? record.source_filename,
    frameworkVersion: record.framework_version ?? "1.0",
    language,
    importedBy: record.uploaded_by,
    sourceFilename: record.source_filename,
    controls: intake.items,
    llmProvider: config.provider,
    llmModel: config.model || null
  });
  const total = countControls(skeleton);
  await updateImportStatus(importId, {
    status: "enriching",
    draft_yaml: skeleton,
    total_controls: total,
    enriched_controls: 0,
    llm_provider: config.provider,
    llm_model: config.model || null
  });

  let enriched = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let costCents = 0;
  for (let d = 0; d < skeleton.domains.length; d++) {
    const domain = skeleton.domains[d];
    for (let c = 0; c < domain.controls.length; c++) {
      const control = domain.controls[c];
      const requirement = control._source?.requirement ?? control.title;
      try {
        const result = await provider.enrich({
          title: control.title,
          requirement,
          language,
          domain: domain.name
        });
        const updated = {
          ...control,
          question: result.fields.question,
          purpose: result.fields.purpose,
          expectedOutcome: result.fields.expectedOutcome,
          howTo: result.fields.howTo,
          evidenceExamples: result.fields.evidenceExamples,
          // Preserve CSV-provided tags; only add LLM tags if user gave none.
          tags: control.tags?.length ? control.tags : result.fields.tags,
          weight: result.fields.weightHint ?? control.weight
        };
        skeleton.domains[d].controls[c] = updated as typeof control;
        tokensIn += result.tokensIn;
        tokensOut += result.tokensOut;
        costCents += estimateCostCents(config.provider, result.tokensIn, result.tokensOut);
      } catch (error) {
        skeleton.domains[d].controls[c] = {
          ...control,
          question: `TODO: LLM-Fehler — ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`,
          _todo: true
        };
      }
      enriched += 1;
      if (enriched % 5 === 0 || enriched === total) {
        await updateImportStatus(importId, {
          draft_yaml: skeleton,
          enriched_controls: enriched,
          llm_tokens_in: tokensIn,
          llm_tokens_out: tokensOut,
          llm_estimated_cost_cents: costCents
        });
      }
    }
  }

  await updateImportStatus(importId, {
    status: "review",
    draft_yaml: skeleton,
    enriched_controls: enriched,
    llm_tokens_in: tokensIn,
    llm_tokens_out: tokensOut,
    llm_estimated_cost_cents: costCents
  });
}
