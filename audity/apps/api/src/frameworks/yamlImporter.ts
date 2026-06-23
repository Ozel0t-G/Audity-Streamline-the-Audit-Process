import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { loadConfig } from "../config.js";
import { pool } from "../db/client.js";

const config = loadConfig();
const syncedHashes = new Map<string, string>();
let syncInProgress = false;

const questionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  answerScale: z.string().trim().min(1).default("0,1,2,3,4,NA"),
  minimumEvidenceExpected: z.number().int().min(0).default(1),
  preferredEvidenceTypes: z.array(z.string()).default([]),
  gapTrigger: z.string().default("score <= 2 or missing approved evidence")
});

const howToStepSchema = z.union([
  z.string().transform((step) => ({ step, details: undefined as string | undefined })),
  z.object({ step: z.string().min(1), details: z.string().optional() })
]);

const scoringSchema = z.object({
  scale: z.string().optional(),
  passWhen: z.string().optional(),
  gapWhen: z.string().optional(),
  quickAnswers: z.record(z.string(), z.string()).optional()
});

const controlSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().default(""),
  categoryId: z.string().trim().min(1).optional(),
  categoryTitle: z.string().trim().min(1).optional(),
  categoryDescription: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  question: z.string().optional(),
  objective: z.string().optional(),
  // ===== v1 authoring-guide additions (all optional, backwards compatible) =====
  purpose: z.string().optional(),
  expectedOutcome: z.array(z.string()).default([]),
  howTo: z.array(howToStepSchema).default([]),
  scoring: scoringSchema.optional(),
  crossReferences: z.array(z.string()).default([]),
  weight: z.number().int().optional(),
  answerType: z.enum(["scale", "boolean", "text_evidence_only", "multiple_choice"]).optional(),
  appliesIf: z.string().optional(),
  evidenceMinimumCount: z.number().int().optional(),
  evidenceRetentionMonths: z.number().int().optional(),
  // ===== Legacy fields =====
  defaultWeight: z.number().default(1),
  readinessPassCondition: z.string().optional(),
  gapCondition: z.string().optional(),
  criticalityHint: z.string().optional(),
  reportMapping: z.record(z.string(), z.unknown()).default({}),
  evidenceExamples: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  licensedMappingSlots: z.array(z.record(z.string(), z.unknown())).default([]),
  suggestions: z.array(z.string()).default([]),
  questions: z.array(questionSchema).optional()
});

const domainSchema = z.object({
  id: z.string().trim().min(1).optional(),
  key: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().default(""),
  controls: z.array(controlSchema).default([])
});

const frameworkYamlSchema = z.object({
  framework: z.object({
    key: z.string().trim().min(1),
    name: z.string().trim().min(1),
    shortName: z.string().trim().min(1).optional(),
    version: z.string().trim().min(1).default("YAML"),
    date: z.union([z.string(), z.date()]).optional(),
    sourceType: z.string().default("yaml_managed"),
    licenseStatus: z.string().default("user_license_required"),
    statusLabel: z.string().default("YAML Managed"),
    distributedByAudity: z.boolean().default(false),
    deliveryMode: z.string().optional(),
    contentClass: z.string().optional(),
    contentStatus: z.string().optional(),
    officialStandardTextIncluded: z.boolean().default(false),
    officialControlCatalogueIncluded: z.boolean().default(false),
    licensedContentImportSupported: z.boolean().default(false),
    redistributionNote: z.string().optional(),
    disclaimer: z.string().optional(),
    defaultSuggestions: z.array(z.string()).default([]),
    // ===== v1 authoring-guide additions (all optional) =====
    schemaVersion: z.number().int().optional(),
    status: z.enum(["draft", "published"]).optional(),
    language: z.string().trim().optional(),
    category: z.string().trim().optional(),
    owner: z.string().trim().optional(),
    intendedAudience: z.array(z.string()).optional(),
    estimatedDurationMinutes: z.number().int().optional(),
    description: z.string().optional(),
    scopeNote: z.string().optional(),
    license: z.object({
      status: z.string().optional(),
      confirmationRequired: z.boolean().optional(),
      notice: z.string().optional()
    }).optional(),
    source: z.string().optional(),
    importMeta: z.record(z.string(), z.unknown()).optional()
  }),
  domains: z.array(domainSchema).default([]),
  controlMappings: z.array(z.object({
    source: z.string().trim().min(1),
    target: z.string().trim().min(1),
    type: z.string().trim().min(1).default("related")
  })).default([]),
  severityRubric: z.record(z.string(), z.string()).optional()
});

type FrameworkYaml = z.infer<typeof frameworkYamlSchema>;

export type FrameworkYamlSyncResult = {
  directory: string;
  scannedFiles: number;
  syncedFiles: number;
  skippedFiles: number;
  errors: Array<{ file: string; message: string }>;
  frameworks: Array<{ file: string; id: string; key: string; name: string; controls: number; questions: number }>;
};

const KNOWN_FRAMEWORK_KEYS = new Set([
  "key", "name", "shortName", "version", "date", "sourceType", "licenseStatus",
  "statusLabel", "distributedByAudity", "deliveryMode", "contentClass",
  "contentStatus", "officialStandardTextIncluded", "officialControlCatalogueIncluded",
  "licensedContentImportSupported", "redistributionNote", "disclaimer",
  "defaultSuggestions", "schemaVersion", "status", "language", "category", "owner",
  "intendedAudience", "estimatedDurationMinutes", "description", "scopeNote",
  "license", "source", "importMeta"
]);
const KNOWN_CONTROL_KEYS = new Set([
  "id", "title", "description", "categoryId", "categoryTitle", "categoryDescription",
  "source", "question", "objective", "defaultWeight", "readinessPassCondition",
  "gapCondition", "criticalityHint", "reportMapping", "evidenceExamples", "tags",
  "licensedMappingSlots", "suggestions", "questions",
  "purpose", "expectedOutcome", "howTo", "scoring", "crossReferences", "weight",
  "answerType", "appliesIf", "evidenceMinimumCount", "evidenceRetentionMonths"
]);

/**
 * Walks the parsed YAML and returns a list of `path.to.unknown_key` for keys
 * the schema silently drops. Used to surface schema drift instead of swallowing it.
 */
function detectUnknownKeys(input: unknown): string[] {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return issues;
  const root = input as Record<string, unknown>;
  if (root.framework && typeof root.framework === "object") {
    const fw = root.framework as Record<string, unknown>;
    for (const key of Object.keys(fw)) {
      if (!KNOWN_FRAMEWORK_KEYS.has(key)) issues.push(`framework.${key}`);
    }
  }
  if (Array.isArray(root.domains)) {
    root.domains.forEach((domain, domainIdx) => {
      if (!domain || typeof domain !== "object") return;
      const controls = (domain as Record<string, unknown>).controls;
      if (!Array.isArray(controls)) return;
      controls.forEach((control, controlIdx) => {
        if (!control || typeof control !== "object") return;
        for (const key of Object.keys(control)) {
          if (!KNOWN_CONTROL_KEYS.has(key)) {
            issues.push(`domains[${domainIdx}].controls[${controlIdx}].${key}`);
          }
        }
      });
    });
  }
  return issues;
}

function stableUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20
  )}-${hash.slice(20, 32)}`;
}

function yamlDirectory(): string {
  return isAbsolute(config.frameworkYamlDirectory)
    ? config.frameworkYamlDirectory
    : resolve(process.cwd(), config.frameworkYamlDirectory);
}

function auditYamlDirectory(): string {
  return isAbsolute(config.auditYamlDirectory)
    ? config.auditYamlDirectory
    : resolve(process.cwd(), config.auditYamlDirectory);
}

function userYamlDirectory(): string {
  return isAbsolute(config.userYamlDirectory)
    ? config.userYamlDirectory
    : resolve(process.cwd(), config.userYamlDirectory);
}

function shippedYamlDirectory(): string {
  return resolve(process.cwd(), "shipped-frameworks");
}

type SyncSource = "shipped" | "user_uploaded";

async function discoverYamlFiles(): Promise<Array<{ path: string; source: SyncSource }>> {
  const results: Array<{ path: string; source: SyncSource }> = [];
  for (const file of await yamlFiles(auditYamlDirectory())) {
    results.push({ path: file, source: "shipped" });
  }
  for (const file of await yamlFiles(userYamlDirectory())) {
    if (file.includes(`${"/"}_sources${"/"}`)) continue;
    results.push({ path: file, source: "user_uploaded" });
  }
  return results;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function yamlFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return yamlFiles(path);
      if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) return [path];
      return [];
    }));
    return files.flat().sort();
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function mappingSlotValue(slot: Record<string, unknown>, camelKey: string, snakeKey: string): unknown {
  return slot[camelKey] ?? slot[snakeKey];
}

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function controlReportMapping(control: z.infer<typeof controlSchema>): Record<string, unknown> {
  return {
    ...control.reportMapping,
    ...compactRecord({
      categoryId: control.categoryId,
      categoryTitle: control.categoryTitle,
      categoryDescription: control.categoryDescription,
      source: control.source,
      suggestions: control.suggestions.length ? control.suggestions : undefined,
      // v1 authoring-guide additions — stored in jsonb so no migration needed
      expectedOutcome: control.expectedOutcome.length ? control.expectedOutcome : undefined,
      howTo: control.howTo.length ? control.howTo : undefined,
      crossReferences: control.crossReferences.length ? control.crossReferences : undefined,
      quickAnswers: control.scoring?.quickAnswers,
      answerType: control.answerType,
      appliesIf: control.appliesIf,
      evidenceMinimumCount: control.evidenceMinimumCount,
      evidenceRetentionMonths: control.evidenceRetentionMonths
    })
  };
}

async function upsertFrameworkFromYaml(file: string, yaml: FrameworkYaml, sourceKind: SyncSource = "shipped") {
  const framework = yaml.framework;
  const frameworkId = stableUuid(`framework:${framework.key}`);
  await pool.query(
    `insert into frameworks
      (id, name, short_name, version, source_type, license_status, distributed_by_audity,
       status_label, disclaimer, license_confirmed, delivery_mode, content_class,
       official_standard_text_included, official_control_catalogue_included,
       licensed_content_import_supported, redistribution_note,
       yaml_source_path, yaml_synced_at, source_kind, archived_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,$12,$13,$14,$15,$16,now(),$17,null,now())
     on conflict (id) do update set
       name = excluded.name,
       short_name = excluded.short_name,
       version = excluded.version,
       source_type = excluded.source_type,
       license_status = excluded.license_status,
       distributed_by_audity = excluded.distributed_by_audity,
       status_label = excluded.status_label,
       disclaimer = excluded.disclaimer,
       license_confirmed = excluded.license_confirmed,
       delivery_mode = excluded.delivery_mode,
       content_class = excluded.content_class,
       official_standard_text_included = excluded.official_standard_text_included,
       official_control_catalogue_included = excluded.official_control_catalogue_included,
       licensed_content_import_supported = excluded.licensed_content_import_supported,
       redistribution_note = excluded.redistribution_note,
       yaml_source_path = excluded.yaml_source_path,
       yaml_synced_at = now(),
       source_kind = excluded.source_kind,
       archived_at = null,
       updated_at = now()`,
    [
      frameworkId,
      framework.name,
      framework.shortName ?? framework.name,
      framework.version,
      framework.sourceType,
      framework.licenseStatus,
      framework.distributedByAudity,
      framework.statusLabel,
      framework.disclaimer ?? framework.contentStatus ?? `Managed from YAML file ${file}.`,
      framework.deliveryMode ?? null,
      framework.contentClass ?? null,
      framework.officialStandardTextIncluded,
      framework.officialControlCatalogueIncluded,
      framework.licensedContentImportSupported,
      framework.redistributionNote ?? null,
      file,
      sourceKind
    ]
  );

  let controlCount = 0;
  let questionCount = 0;
  const syncedDomainIds: string[] = [];
  const syncedControlIds: string[] = [];
  for (const [domainIndex, domain] of yaml.domains.entries()) {
    const domainKey = domain.id ?? domain.key ?? domain.name;
    const existingDomain = await pool.query<{ id: string }>(
      `select id
       from framework_domains
       where framework_id = $1
         and (name = $2 or domain_id = $3)
       limit 1`,
      [frameworkId, domain.name, domainKey]
    );
    const domainId = existingDomain.rows[0]?.id ?? stableUuid(`domain:${framework.key}:${domainKey}`);
    syncedDomainIds.push(domainId);
    await pool.query(
      `insert into framework_domains (id, framework_id, domain_id, name, description, sort_order)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set
         framework_id = excluded.framework_id,
         domain_id = excluded.domain_id,
         name = excluded.name,
         description = excluded.description,
         sort_order = excluded.sort_order`,
      [domainId, frameworkId, domain.id ?? domain.key ?? null, domain.name, domain.description, domainIndex + 1]
    );

    for (const [controlIndex, control] of domain.controls.entries()) {
      const existingControl = await pool.query<{ id: string }>(
        "select id from framework_controls where framework_domain_id = $1 and control_code = $2 limit 1",
        [domainId, control.id]
      );
      const controlId = existingControl.rows[0]?.id ?? stableUuid(`control:${framework.key}:${control.id}`);
      syncedControlIds.push(controlId);
      const defaultQuestion = control.question ?? `Assess readiness for ${control.title}`;
      await pool.query(
        `insert into framework_controls
          (id, framework_domain_id, control_code, title, description, question_text,
           evidence_examples, tags, sort_order, audity_objective, default_weight,
           readiness_pass_condition, gap_condition, criticality_hint, report_mapping)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         on conflict (id) do update set
           framework_domain_id = excluded.framework_domain_id,
           control_code = excluded.control_code,
           title = excluded.title,
           description = excluded.description,
           question_text = excluded.question_text,
           evidence_examples = excluded.evidence_examples,
           tags = excluded.tags,
           sort_order = excluded.sort_order,
           audity_objective = excluded.audity_objective,
           default_weight = excluded.default_weight,
           readiness_pass_condition = excluded.readiness_pass_condition,
           gap_condition = excluded.gap_condition,
           criticality_hint = excluded.criticality_hint,
           report_mapping = excluded.report_mapping`,
        [
          controlId,
          domainId,
          control.id,
          control.title,
          // v1 YAMLs ship no per-control description; fall back to title so the
          // DB row isn't empty (UI uses this in collapsed control summaries).
          control.description || control.purpose || control.title,
          defaultQuestion,
          JSON.stringify(control.evidenceExamples),
          JSON.stringify(control.tags),
          controlIndex + 1,
          // purpose (v1 authoring guide) is the canonical "why" — falls back to
          // legacy objective/description so existing YAMLs still produce content.
          control.purpose ?? control.objective ?? control.description,
          // weight (v1) > defaultWeight (legacy) > 1
          control.weight ?? control.defaultWeight,
          // scoring.passWhen (v1) > readinessPassCondition (legacy) > built-in default
          control.scoring?.passWhen ?? control.readinessPassCondition ?? "average_question_score >= 3 and at least one relevant evidence item approved",
          control.scoring?.gapWhen ?? control.gapCondition ?? "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
          control.criticalityHint ?? null,
          JSON.stringify(controlReportMapping(control))
        ]
      );
      controlCount += 1;

      for (const [evidenceIndex, evidenceType] of control.evidenceExamples.entries()) {
        await pool.query(
          `insert into framework_evidence_requirements
            (id, control_id, evidence_type, required_by_default, freshness_days, sort_order)
           values ($1,$2,$3,true,null,$4)
           on conflict (control_id, evidence_type) do update set
             control_id = excluded.control_id,
             evidence_type = excluded.evidence_type,
             required_by_default = excluded.required_by_default,
             freshness_days = excluded.freshness_days,
             sort_order = excluded.sort_order`,
          [
            stableUuid(`evidence-requirement:${framework.key}:${control.id}:${evidenceType}`),
            controlId,
            evidenceType,
            evidenceIndex + 1
          ]
        );
      }

      for (const slot of control.licensedMappingSlots) {
        const frameworkFamily = String(mappingSlotValue(slot, "frameworkFamily", "framework_family") ?? "generic");
        const tenantReferenceId = mappingSlotValue(slot, "tenantReferenceId", "tenant_reference_id");
        const tenantReferenceTitle = mappingSlotValue(slot, "tenantReferenceTitle", "tenant_control_title");
        const mappingStatus = mappingSlotValue(slot, "mappingStatus", "mapping_status");
        await pool.query(
          `insert into licensed_framework_mappings
            (id, audity_control_id, tenant_reference_id, tenant_reference_title, mapping_status)
           values ($1,$2,$3,$4,$5)
           on conflict (id) do update set
             tenant_reference_id = excluded.tenant_reference_id,
             tenant_reference_title = excluded.tenant_reference_title,
             mapping_status = excluded.mapping_status,
             updated_at = now()`,
          [
            stableUuid(`licensed-mapping-slot:${framework.key}:${control.id}:${frameworkFamily}`),
            controlId,
            tenantReferenceId ? String(tenantReferenceId) : null,
            tenantReferenceTitle ? String(tenantReferenceTitle) : null,
            String(mappingStatus ?? "empty_until_tenant_imports_licensed_content")
          ]
        );
      }

      const questions = control.questions ?? [
        {
          id: `${control.id}-Q1`,
          text: defaultQuestion,
          answerScale: "0,1,2,3,4,NA",
          minimumEvidenceExpected: 1,
          preferredEvidenceTypes: control.evidenceExamples,
          gapTrigger: "score <= 2 or missing approved evidence"
        }
      ];
      for (const [questionIndex, question] of questions.entries()) {
        await pool.query(
          `insert into question_control_mappings
            (id, framework_id, framework_control_id, question_id, question, answer_scale,
             minimum_evidence_expected, preferred_evidence_types, gap_trigger, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           on conflict (framework_id, question_id, framework_control_id) do update set
             question = excluded.question,
             answer_scale = excluded.answer_scale,
             minimum_evidence_expected = excluded.minimum_evidence_expected,
             preferred_evidence_types = excluded.preferred_evidence_types,
             gap_trigger = excluded.gap_trigger,
             sort_order = excluded.sort_order`,
          [
            stableUuid(`question-control:${framework.key}:${control.id}:${question.id}`),
            frameworkId,
            controlId,
            question.id,
            question.text,
            question.answerScale,
            question.minimumEvidenceExpected,
            JSON.stringify(question.preferredEvidenceTypes),
            question.gapTrigger,
            controlIndex * 10 + questionIndex + 1
          ]
        );
        questionCount += 1;
      }
    }
  }

  await pool.query(
    `update assessment_questions
     set framework_control_id = null
     where framework_control_id in (
       select fc.id
       from framework_controls fc
       join framework_domains fd on fd.id = fc.framework_domain_id
       where fd.framework_id = $1
         and not (fc.id = any($2::uuid[]))
     )`,
    [frameworkId, syncedControlIds]
  );

  await pool.query(
    `update findings
     set framework_control_id = null
     where framework_control_id in (
       select fc.id
       from framework_controls fc
       join framework_domains fd on fd.id = fc.framework_domain_id
       where fd.framework_id = $1
         and not (fc.id = any($2::uuid[]))
     )`,
    [frameworkId, syncedControlIds]
  );

  await pool.query(
    `update risks
     set source_framework_control_id = null
     where source_framework_control_id in (
       select fc.id
       from framework_controls fc
       join framework_domains fd on fd.id = fc.framework_domain_id
       where fd.framework_id = $1
         and not (fc.id = any($2::uuid[]))
     )`,
    [frameworkId, syncedControlIds]
  );

  await pool.query(
    `delete from framework_controls fc
     using framework_domains fd
     where fc.framework_domain_id = fd.id
       and fd.framework_id = $1
       and not (fc.id = any($2::uuid[]))`,
    [frameworkId, syncedControlIds]
  );

  await pool.query(
    `delete from framework_domains fd
     where fd.framework_id = $1
       and not (fd.id = any($2::uuid[]))
       and not exists (
         select 1 from framework_controls fc
         where fc.framework_domain_id = fd.id
       )`,
    [frameworkId, syncedDomainIds]
  );

  return {
    file,
    id: frameworkId,
    key: framework.key,
    name: framework.name,
    controls: controlCount,
    questions: questionCount
  };
}

async function upsertControlMapping(sourceCode: string, targetCode: string, mappingType: string) {
  const [source, target] = await Promise.all([
    pool.query<{ id: string }>("select id from framework_controls where control_code = $1 order by id limit 1", [sourceCode]),
    pool.query<{ id: string }>("select id from framework_controls where control_code = $1 order by id limit 1", [targetCode])
  ]);
  if (!source.rows[0] || !target.rows[0]) return;
  await pool.query(
    `insert into control_mappings (id, source_control_id, target_control_id, mapping_type)
     values ($1,$2,$3,$4)
     on conflict (id) do update set mapping_type = excluded.mapping_type`,
    [stableUuid(`mapping:${sourceCode}:${targetCode}`), source.rows[0].id, target.rows[0].id, mappingType]
  );
}

export async function syncFrameworkYamlFiles(options: { force?: boolean } = {}): Promise<FrameworkYamlSyncResult> {
  if (syncInProgress) {
    return {
      directory: yamlDirectory(),
      scannedFiles: 0,
      syncedFiles: 0,
      skippedFiles: 0,
      errors: [{ file: "*", message: "Framework YAML sync is already running" }],
      frameworks: []
    };
  }
  syncInProgress = true;
  try {
    let entries = await discoverYamlFiles();
    if (entries.length === 0) {
      const shippedFiles = await yamlFiles(shippedYamlDirectory());
      entries = shippedFiles.map((path) => ({ path, source: "shipped" as SyncSource }));
    }
    const directory = `${auditYamlDirectory()}, ${userYamlDirectory()}, ${yamlDirectory()}`;
    const result: FrameworkYamlSyncResult = {
      directory,
      scannedFiles: 0,
      syncedFiles: 0,
      skippedFiles: 0,
      errors: [],
      frameworks: []
    };
    const controlMappings: Array<{ source: string; target: string; type: string }> = [];
    const scannedPaths: string[] = [];
    for (const entry of entries) {
      const file = entry.path;
      result.scannedFiles += 1;
      try {
        const fileStat = await stat(file);
        if (!fileStat.isFile()) continue;
        scannedPaths.push(file);
        const raw = await readFile(file, "utf8");
        const hash = sha256(raw);
        if (!options.force && syncedHashes.get(file) === hash) {
          result.skippedFiles += 1;
          continue;
        }
        const rawParsed = parse(raw) as unknown;
        const unknownKeys = detectUnknownKeys(rawParsed);
        if (unknownKeys.length > 0) {
          result.errors.push({
            file,
            message: `Warning: ignored unknown YAML keys: ${unknownKeys.slice(0, 12).join(", ")}${unknownKeys.length > 12 ? " (truncated)" : ""}`
          });
        }
        const parsed = frameworkYamlSchema.parse(rawParsed);
        const framework = await upsertFrameworkFromYaml(file, parsed, entry.source);
        controlMappings.push(...parsed.controlMappings);
        syncedHashes.set(file, hash);
        result.syncedFiles += 1;
        result.frameworks.push(framework);
      } catch (error) {
        result.errors.push({
          file,
          message: error instanceof Error ? error.message : "Unknown YAML sync error"
        });
      }
    }
    for (const mapping of controlMappings) {
      await upsertControlMapping(mapping.source, mapping.target, mapping.type);
    }
    // Soft-archive frameworks whose YAML source file disappeared since the last
    // sync. Also force-archive any rows still flagged source_kind='legacy'
    // (the old frameworks/ folder is no longer scanned).
    if (scannedPaths.length > 0) {
      await pool.query(
        `update frameworks
         set archived_at = now(), updated_at = now()
         where archived_at is null
           and (
             (yaml_source_path is not null and yaml_source_path <> all($1::text[]))
             or source_kind = 'legacy'
           )`,
        [scannedPaths]
      );
    } else {
      // A scan that found zero files is almost always a transient error (e.g. a
      // missing mount or read failure), not the user genuinely deleting every
      // framework YAML. Archiving the whole catalog here would be catastrophic
      // and hard to recover, so skip archiving and surface a warning instead.
      result.errors.push({
        file: directory,
        message: "Skipped framework archiving: no YAML files were scanned (possible transient read error)."
      });
    }
    return result;
  } finally {
    syncInProgress = false;
  }
}

export function startFrameworkYamlAutoSync(logger?: { info: (value: unknown, message?: string) => void; error: (value: unknown, message?: string) => void }) {
  const intervalSeconds = Math.max(5, config.frameworkYamlSyncIntervalSeconds);
  void syncFrameworkYamlFiles({ force: true })
    .then((result) => {
      if (result.scannedFiles > 0) logger?.info(result, "Framework YAML initial sync completed");
    })
    .catch((error) => logger?.error(error, "Framework YAML initial sync failed"));
  const timer = setInterval(() => {
    void syncFrameworkYamlFiles()
      .then((result) => {
        if (result.syncedFiles > 0 || result.errors.length > 0) {
          logger?.info(result, "Framework YAML sync completed");
        }
      })
      .catch((error) => logger?.error(error, "Framework YAML sync failed"));
  }, intervalSeconds * 1000);
  timer.unref();
  return timer;
}
