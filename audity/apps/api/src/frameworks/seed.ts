import { createHash } from "node:crypto";
import { pool } from "../db/client.js";
import { audityReadinessPack } from "./readinessPack.js";

const frameworkDisclaimer =
  "Audity provides built-in public-framework summaries and Audity-native readiness workflows for assessment support. User-imported or license-restricted frameworks require the user's own license confirmation before use.";

type SeedControl = {
  code: string;
  title: string;
  description: string;
  question: string;
  evidenceExamples: string[];
  tags?: string[];
  audityObjective?: string;
  defaultWeight?: number;
  readinessPassCondition?: string;
  gapCondition?: string;
  criticalityHint?: string;
  reportMapping?: Record<string, unknown>;
  licensedMappingSlots?: Array<Record<string, unknown>>;
  questions?: Array<{
    questionId: string;
    question: string;
    answerScale: string;
    minimumEvidenceExpected: number;
    preferredEvidenceTypes: string[];
    gapTrigger: string;
  }>;
};

type SeedDomain = {
  domainId?: string;
  name: string;
  description: string;
  controls: SeedControl[];
};

type SeedFramework = {
  key: string;
  name: string;
  shortName: string;
  version: string;
  sourceType: string;
  licenseStatus: string;
  statusLabel: string;
  distributedByAudity: boolean;
  deliveryMode?: string;
  contentClass?: string;
  contentStatus?: string;
  officialStandardTextIncluded?: boolean;
  officialControlCatalogueIncluded?: boolean;
  licensedContentImportSupported?: boolean;
  redistributionNote?: string;
  domains: SeedDomain[];
};

function stableUuid(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(
    16,
    20
  )}-${hash.slice(20, 32)}`;
}

const readinessFrameworks: SeedFramework[] = audityReadinessPack.map((framework) => ({
  key: framework.framework_id,
  name: framework.display_name,
  shortName: framework.framework_id.includes("iec62443") ? "IEC 62443 Readiness" : "ISO 27001 Readiness",
  version: framework.framework_id.includes("iso27001") ? "2022" : "Audity 2026",
  sourceType: "audity_native_readiness",
  licenseStatus: "readiness_workflow_only",
  statusLabel: "Readiness Workflow Only",
  distributedByAudity: true,
  deliveryMode: framework.delivery_mode,
  contentClass: framework.content_class,
  contentStatus: framework.content_status,
  officialStandardTextIncluded: framework.official_standard_text_included,
  officialControlCatalogueIncluded: framework.official_control_catalogue_included,
  licensedContentImportSupported: framework.licensed_content_import_supported,
  redistributionNote: framework.redistribution_note,
  domains: framework.domains.map((domain) => ({
    domainId: domain.domain_id,
    name: domain.name,
    description: domain.description,
    controls: framework.controls
      .filter((control) => control.domain === domain.name)
      .map((control) => {
        const questions = framework.question_control_mappings
          .filter((question) => question.maps_to_control_ids.includes(control.control_id))
          .map((question) => ({
            questionId: question.question_id,
            question: question.question,
            answerScale: question.answer_scale,
            minimumEvidenceExpected: Number(question.minimum_evidence_expected),
            preferredEvidenceTypes: question.preferred_evidence_types,
            gapTrigger: question.gap_trigger
          }));
        return {
          code: control.control_id,
          title: control.title,
          description: control.audity_objective,
          question: questions[0]?.question ?? `Assess readiness for ${control.title}`,
          evidenceExamples: control.evidence_requirements,
          tags: ["audity-native-readiness", framework.framework_id],
          audityObjective: control.audity_objective,
          defaultWeight: Number(control.default_weight),
          readinessPassCondition: control.readiness_pass_condition,
          gapCondition: control.gap_condition,
          criticalityHint: control.criticality_hint,
          reportMapping: control.report_mapping ?? {},
          licensedMappingSlots: control.licensed_framework_mapping_slots,
          questions
        };
      })
  }))
}));

const frameworks: SeedFramework[] = [
  {
    key: "nist-csf-2",
    name: "NIST Cybersecurity Framework",
    shortName: "NIST CSF",
    version: "2.0",
    sourceType: "public",
    licenseStatus: "public",
    statusLabel: "Built-in",
    distributedByAudity: true,
    domains: [
      {
        name: "Govern",
        description: "Cybersecurity strategy, accountability, policy, and oversight.",
        controls: [
          {
            code: "GV.OC",
            title: "Organizational Context",
            description: "Business objectives, dependencies, and risk conditions are understood.",
            question: "How clearly are business objectives, dependencies, and cybersecurity expectations documented for this assessment scope?",
            evidenceExamples: ["Business context summary", "Dependency register", "Risk appetite statement"]
          },
          {
            code: "GV.RM",
            title: "Risk Management Strategy",
            description: "Cybersecurity risk criteria and ownership are defined.",
            question: "How consistently are cybersecurity risk criteria, ownership, and decision paths applied?",
            evidenceExamples: ["Risk methodology", "Risk register", "Risk committee minutes"]
          },
          {
            code: "GV.RR",
            title: "Roles and Responsibilities",
            description: "Cybersecurity roles, accountability, and escalation paths are assigned.",
            question: "How well are cybersecurity roles, accountability, and escalation responsibilities assigned and understood?",
            evidenceExamples: ["RACI matrix", "Role descriptions", "Escalation procedure"]
          }
        ]
      },
      {
        name: "Identify",
        description: "Assets, services, data, and dependencies are known.",
        controls: [
          {
            code: "ID.AM",
            title: "Asset Management",
            description: "Assets, systems, services, and data flows are inventoried.",
            question: "How complete and current is the inventory of assets, services, data flows, and external dependencies?",
            evidenceExamples: ["Asset inventory", "CMDB extract", "Data flow overview"]
          },
          {
            code: "ID.RA",
            title: "Risk Assessment",
            description: "Threats, vulnerabilities, likelihood, and impact are assessed.",
            question: "How consistently are threats, vulnerabilities, likelihood, and impact assessed for in-scope systems?",
            evidenceExamples: ["Risk assessment report", "Threat model", "Vulnerability summary"]
          }
        ]
      },
      {
        name: "Protect",
        description: "Controls reduce the likelihood and impact of cybersecurity events.",
        controls: [
          {
            code: "PR.AA",
            title: "Identity and Access",
            description: "Identities, credentials, and access privileges are controlled.",
            question: "How mature are identity lifecycle, access approval, privilege review, and authentication controls?",
            evidenceExamples: ["Access review", "MFA policy", "Joiner-mover-leaver procedure"]
          },
          {
            code: "PR.DS",
            title: "Data Security",
            description: "Data is protected according to business and regulatory need.",
            question: "How well is sensitive data protected across storage, transmission, retention, and deletion?",
            evidenceExamples: ["Data classification", "Encryption standard", "Retention policy"]
          },
          {
            code: "PR.PS",
            title: "Platform Security",
            description: "Platforms are securely configured and maintained.",
            question: "How consistently are hardening, patching, baseline configuration, and vulnerability remediation managed?",
            evidenceExamples: ["Hardening baseline", "Patch reports", "Vulnerability SLA tracking"]
          }
        ]
      },
      {
        name: "Detect",
        description: "Potential cybersecurity events are discovered and analyzed.",
        controls: [
          {
            code: "DE.CM",
            title: "Continuous Monitoring",
            description: "Systems and events are monitored for anomalies and security signals.",
            question: "How effectively are security logs, alerts, and monitoring coverage reviewed for the assessment scope?",
            evidenceExamples: ["SIEM coverage list", "Alert triage records", "Monitoring dashboard"]
          }
        ]
      },
      {
        name: "Respond",
        description: "Incidents are handled through planned response activities.",
        controls: [
          {
            code: "RS.MA",
            title: "Incident Management",
            description: "Incidents are triaged, escalated, contained, and communicated.",
            question: "How well can the organization triage, escalate, contain, and communicate cybersecurity incidents?",
            evidenceExamples: ["Incident response plan", "Exercise report", "Incident ticket sample"]
          }
        ]
      },
      {
        name: "Recover",
        description: "Recovery activities restore operations and improve resilience.",
        controls: [
          {
            code: "RC.RP",
            title: "Recovery Planning",
            description: "Recovery plans and backups support restoration objectives.",
            question: "How well are recovery plans, backups, restoration tests, and improvement actions managed?",
            evidenceExamples: ["Backup test record", "Recovery plan", "Lessons learned register"]
          }
        ]
      }
    ]
  },
  {
    key: "audity-iso27001-readiness",
    name: "Audity ISO 27001 Readiness Questions",
    shortName: "ISO Readiness",
    version: "Audity 2026",
    sourceType: "audity_native_readiness",
    licenseStatus: "readiness_workflow_only",
    statusLabel: "Readiness Workflow Only",
    distributedByAudity: true,
    domains: [
      {
        name: "ISMS Scope",
        description: "Original Audity readiness questions for scope, boundaries, and context.",
        controls: [
          {
            code: "AUD-ISO-SCOPE-01",
            title: "Scope boundaries",
            description: "The intended ISMS boundary is clear enough for readiness planning.",
            question: "Can the team clearly explain which locations, systems, processes, suppliers, and data types are inside the intended ISMS scope?",
            evidenceExamples: ["Scope statement", "System list", "Supplier list"],
            tags: ["iso-readiness"]
          },
          {
            code: "AUD-ISO-SCOPE-02",
            title: "Interested parties",
            description: "Relevant business, legal, customer, and operational expectations are captured.",
            question: "Are stakeholder expectations and regulatory drivers captured in a way that influences the security program?",
            evidenceExamples: ["Stakeholder register", "Regulatory register", "Customer requirements"],
            tags: ["iso-readiness"]
          }
        ]
      },
      {
        name: "Risk Management",
        description: "Original Audity readiness questions for risk assessment and treatment.",
        controls: [
          {
            code: "AUD-ISO-RISK-01",
            title: "Risk assessment method",
            description: "A repeatable risk method is defined and used.",
            question: "Does the organization use a documented and repeatable method for identifying, evaluating, and prioritizing information security risks?",
            evidenceExamples: ["Risk methodology", "Risk register", "Assessment workshop notes"],
            tags: ["iso-readiness"]
          },
          {
            code: "AUD-ISO-RISK-02",
            title: "Risk treatment planning",
            description: "Treatment decisions are documented, owned, and followed up.",
            question: "Are risk treatment decisions assigned to owners with actions, due dates, and review rhythm?",
            evidenceExamples: ["Treatment plan", "Owner list", "Management review notes"],
            tags: ["iso-readiness"]
          },
          {
            code: "AUD-ISO-RISK-03",
            title: "Control applicability readiness",
            description: "Control applicability decisions are explainable and evidence-backed.",
            question: "Can the team explain why candidate controls are applicable or not applicable without relying on copied standard text?",
            evidenceExamples: ["Applicability rationale", "Control owner notes", "Gap analysis"],
            tags: ["iso-readiness"]
          }
        ]
      },
      {
        name: "Governance and Review",
        description: "Original Audity readiness questions for ownership, review, and improvement.",
        controls: [
          {
            code: "AUD-ISO-GOV-01",
            title: "Security ownership",
            description: "Accountability and operating cadence are visible.",
            question: "Are security responsibilities, review forums, and escalation paths visible to both leadership and operational teams?",
            evidenceExamples: ["RACI", "Meeting cadence", "Escalation matrix"],
            tags: ["iso-readiness"]
          },
          {
            code: "AUD-ISO-GOV-02",
            title: "Internal review readiness",
            description: "Internal review, audit preparation, and corrective action tracking are planned.",
            question: "Is there a practical plan for internal review, readiness checks, corrective actions, and evidence collection?",
            evidenceExamples: ["Internal review plan", "Action tracker", "Evidence checklist"],
            tags: ["iso-readiness"]
          }
        ]
      },
      {
        name: "Operational Controls",
        description: "Original Audity readiness questions for core security operations.",
        controls: [
          {
            code: "AUD-ISO-OPS-01",
            title: "Access governance",
            description: "Access is requested, approved, reviewed, and removed.",
            question: "Are access approvals, privileged access, periodic reviews, and leaver removals working reliably?",
            evidenceExamples: ["Access request samples", "Review records", "Leaver checklist"],
            tags: ["iso-readiness"]
          },
          {
            code: "AUD-ISO-OPS-02",
            title: "Incident readiness",
            description: "Incident response is practical, tested, and connected to business decision makers.",
            question: "Can the team show how incidents are detected, classified, escalated, documented, and learned from?",
            evidenceExamples: ["Incident procedure", "Exercise notes", "Post-incident review"],
            tags: ["iso-readiness"]
          },
          {
            code: "AUD-ISO-OPS-03",
            title: "Backup and recovery readiness",
            description: "Restoration expectations are defined and tested.",
            question: "Are backup coverage, restore testing, recovery objectives, and ownership documented for critical services?",
            evidenceExamples: ["Backup policy", "Restore test", "Service recovery objectives"],
            tags: ["iso-readiness"]
          }
        ]
      }
    ]
  },
  ...readinessFrameworks
];

export async function seedFrameworks(): Promise<void> {
  for (const framework of frameworks) {
    const frameworkId = stableUuid(`framework:${framework.key}`);
    await pool.query(
      `insert into frameworks
        (id, name, short_name, version, source_type, license_status, distributed_by_audity,
         status_label, disclaimer, license_confirmed, delivery_mode, content_class,
         official_standard_text_included, official_control_catalogue_included,
         licensed_content_import_supported, redistribution_note, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, $14, $15, now())
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
        updated_at = now()`,
      [
        frameworkId,
        framework.name,
        framework.shortName,
        framework.version,
        framework.sourceType,
        framework.licenseStatus,
        framework.distributedByAudity,
        framework.statusLabel,
        framework.contentStatus ?? frameworkDisclaimer,
        framework.deliveryMode ?? null,
        framework.contentClass ?? null,
        framework.officialStandardTextIncluded ?? false,
        framework.officialControlCatalogueIncluded ?? false,
        framework.licensedContentImportSupported ?? false,
        framework.redistributionNote ?? null
      ]
    );

    for (const [domainIndex, domain] of framework.domains.entries()) {
      const domainId = stableUuid(`domain:${framework.key}:${domain.name}`);
      await pool.query(
        `insert into framework_domains (id, framework_id, domain_id, name, description, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (id) do update set
          domain_id = excluded.domain_id,
          name = excluded.name,
          description = excluded.description,
          sort_order = excluded.sort_order`,
        [domainId, frameworkId, domain.domainId ?? null, domain.name, domain.description, domainIndex + 1]
      );

      for (const [controlIndex, control] of domain.controls.entries()) {
        const controlId = stableUuid(`control:${framework.key}:${control.code}`);
        await pool.query(
          `insert into framework_controls
            (id, framework_domain_id, control_code, title, description, question_text,
             evidence_examples, tags, sort_order, audity_objective, default_weight,
             readiness_pass_condition, gap_condition, criticality_hint, report_mapping)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
            control.code,
            control.title,
            control.description,
            control.question,
            JSON.stringify(control.evidenceExamples),
            JSON.stringify(control.tags ?? []),
            controlIndex + 1,
            control.audityObjective ?? control.description,
            control.defaultWeight ?? 1,
            control.readinessPassCondition ?? "average_question_score >= 3 and at least one relevant evidence item approved",
            control.gapCondition ?? "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
            control.criticalityHint ?? null,
            JSON.stringify(control.reportMapping ?? {})
          ]
        );

        for (const [evidenceIndex, evidenceType] of control.evidenceExamples.entries()) {
          await pool.query(
            `insert into framework_evidence_requirements
              (id, control_id, evidence_type, required_by_default, freshness_days, sort_order)
             values ($1, $2, $3, true, null, $4)
             on conflict (id) do update set
              evidence_type = excluded.evidence_type,
              required_by_default = excluded.required_by_default,
              freshness_days = excluded.freshness_days,
              sort_order = excluded.sort_order`,
            [
              stableUuid(`evidence-requirement:${framework.key}:${control.code}:${evidenceType}`),
              controlId,
              evidenceType,
              evidenceIndex + 1
            ]
          );
        }

        for (const slot of control.licensedMappingSlots ?? []) {
          await pool.query(
            `insert into licensed_framework_mappings
              (id, audity_control_id, tenant_reference_id, tenant_reference_title, mapping_status)
             values ($1, $2, $3, $4, $5)
             on conflict (id) do update set
              tenant_reference_id = excluded.tenant_reference_id,
              tenant_reference_title = excluded.tenant_reference_title,
              mapping_status = excluded.mapping_status,
              updated_at = now()`,
            [
              stableUuid(`licensed-mapping-slot:${framework.key}:${control.code}:${String(slot.framework_family ?? "generic")}`),
              controlId,
              slot.tenant_reference_id ?? null,
              slot.tenant_control_title ?? null,
              String(slot.mapping_status ?? "empty_until_tenant_imports_licensed_content")
            ]
          );
        }

        for (const [questionIndex, question] of (control.questions ?? [{
          questionId: `${control.code}-Q1`,
          question: control.question,
          answerScale: "0,1,2,3,4,NA",
          minimumEvidenceExpected: 1,
          preferredEvidenceTypes: control.evidenceExamples,
          gapTrigger: "score <= 2 or missing approved evidence"
        }]).entries()) {
          await pool.query(
            `insert into question_control_mappings
              (id, framework_id, framework_control_id, question_id, question, answer_scale,
               minimum_evidence_expected, preferred_evidence_types, gap_trigger, sort_order)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             on conflict (framework_id, question_id, framework_control_id) do update set
              question = excluded.question,
              answer_scale = excluded.answer_scale,
              minimum_evidence_expected = excluded.minimum_evidence_expected,
              preferred_evidence_types = excluded.preferred_evidence_types,
              gap_trigger = excluded.gap_trigger,
              sort_order = excluded.sort_order`,
            [
              stableUuid(`question-control:${framework.key}:${control.code}:${question.questionId}`),
              frameworkId,
              controlId,
              question.questionId,
              question.question,
              question.answerScale,
              question.minimumEvidenceExpected,
              JSON.stringify(question.preferredEvidenceTypes),
              question.gapTrigger,
              controlIndex * 10 + questionIndex + 1
            ]
          );
        }
      }
    }
  }

  const mappings = [
    ["AUD-ISO-SCOPE-01", "GV.OC"],
    ["AUD-ISO-RISK-01", "ID.RA"],
    ["AUD-ISO-OPS-01", "PR.AA"],
    ["AUD-ISO-OPS-02", "RS.MA"],
    ["AUD-ISO-OPS-03", "RC.RP"]
  ];
  for (const [sourceCode, targetCode] of mappings) {
    const source = await pool.query<{ id: string }>(
      "select id from framework_controls where control_code = $1",
      [sourceCode]
    );
    const target = await pool.query<{ id: string }>(
      "select id from framework_controls where control_code = $1",
      [targetCode]
    );
    if (source.rows[0] && target.rows[0]) {
      const id = stableUuid(`mapping:${sourceCode}:${targetCode}`);
      await pool.query(
        `insert into control_mappings (id, source_control_id, target_control_id, mapping_type)
         values ($1, $2, $3, 'related')
         on conflict (id) do nothing`,
        [id, source.rows[0].id, target.rows[0].id]
      );
    }
  }
}
