export type ReadinessFrameworkPack = {
  framework_id: string;
  display_name: string;
  delivery_mode: string;
  content_class: string;
  content_status: string;
  official_standard_text_included: boolean;
  official_control_catalogue_included: boolean;
  redistribution_note: string;
  licensed_content_import_supported: boolean;
  domains: Array<{ domain_id: string; name: string; description: string }>;
  controls: Array<{
    control_id: string;
    domain: string;
    title: string;
    audity_objective: string;
    question_ids: string[];
    evidence_requirements: string[];
    default_weight: string;
    criticality_hint: string;
    readiness_pass_condition: string;
    gap_condition: string;
    report_mapping?: Record<string, unknown>;
    licensed_framework_mapping_slots: Array<Record<string, unknown>>;
  }>;
  question_control_mappings: Array<{
    question_id: string;
    question: string;
    maps_to_control_ids: string[];
    answer_scale: string;
    minimum_evidence_expected: string;
    preferred_evidence_types: string[];
    gap_trigger: string;
  }>;
};

export const audityReadinessPack = [
  {
    "framework_id": "audity.iso27001.readiness.2022",
    "domains": [
      {
        "domain_id": "SCOPE-AND-CONTEXT",
        "name": "Scope and Context",
        "description": "Audity readiness domain for scope and context activities."
      },
      {
        "domain_id": "GOVERNANCE-AND-LEADERSHIP",
        "name": "Governance and Leadership",
        "description": "Audity readiness domain for governance and leadership activities."
      },
      {
        "domain_id": "POLICY-AND-PROCEDURE-MANAGEMENT",
        "name": "Policy and Procedure Management",
        "description": "Audity readiness domain for policy and procedure management activities."
      },
      {
        "domain_id": "RISK-MANAGEMENT",
        "name": "Risk Management",
        "description": "Audity readiness domain for risk management activities."
      },
      {
        "domain_id": "ASSET-AND-INFORMATION-HANDLING",
        "name": "Asset and Information Handling",
        "description": "Audity readiness domain for asset and information handling activities."
      },
      {
        "domain_id": "IDENTITY-AND-ACCESS",
        "name": "Identity and Access",
        "description": "Audity readiness domain for identity and access activities."
      },
      {
        "domain_id": "SECURE-OPERATIONS",
        "name": "Secure Operations",
        "description": "Audity readiness domain for secure operations activities."
      },
      {
        "domain_id": "RESILIENCE-AND-CONTINUITY",
        "name": "Resilience and Continuity",
        "description": "Audity readiness domain for resilience and continuity activities."
      },
      {
        "domain_id": "MONITORING-AND-DETECTION",
        "name": "Monitoring and Detection",
        "description": "Audity readiness domain for monitoring and detection activities."
      },
      {
        "domain_id": "INCIDENT-MANAGEMENT",
        "name": "Incident Management",
        "description": "Audity readiness domain for incident management activities."
      },
      {
        "domain_id": "SUPPLIER-AND-THIRD-PARTY-SECURITY",
        "name": "Supplier and Third-Party Security",
        "description": "Audity readiness domain for supplier and third-party security activities."
      },
      {
        "domain_id": "PEOPLE-AND-AWARENESS",
        "name": "People and Awareness",
        "description": "Audity readiness domain for people and awareness activities."
      },
      {
        "domain_id": "ASSURANCE-AND-IMPROVEMENT",
        "name": "Assurance and Improvement",
        "description": "Audity readiness domain for assurance and improvement activities."
      }
    ],
    "controls": [
      {
        "control_id": "ISO-RDY-001",
        "evidence_requirements": [
          "Scope statement",
          "System/service inventory extract",
          "Boundary diagram",
          "Exclusion rationale"
        ],
        "question_ids": [
          "Q-ISO-RDY-001-01",
          "Q-ISO-RDY-001-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Scope and Context",
        "title": "ISMS scope and boundaries",
        "audity_objective": "Confirm that the assessment has a clear organizational, technical, and process boundary.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Scope and Context",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-002",
        "evidence_requirements": [
          "Requirement register",
          "Contract security clauses",
          "Regulatory applicability note",
          "Review log"
        ],
        "question_ids": [
          "Q-ISO-RDY-002-01",
          "Q-ISO-RDY-002-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Scope and Context",
        "title": "External and internal requirement register",
        "audity_objective": "Maintain a living view of obligations that affect security decisions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Scope and Context",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-003",
        "evidence_requirements": [
          "Role matrix",
          "Decision log",
          "Management meeting minutes",
          "Security charter"
        ],
        "question_ids": [
          "Q-ISO-RDY-003-01",
          "Q-ISO-RDY-003-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Governance and Leadership",
        "title": "Security accountability",
        "audity_objective": "Make security ownership visible enough that decisions do not depend on informal assumptions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Governance and Leadership",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-004",
        "evidence_requirements": [
          "RACI matrix",
          "Control owner list",
          "Asset owner list",
          "Job descriptions or role descriptions"
        ],
        "question_ids": [
          "Q-ISO-RDY-004-01",
          "Q-ISO-RDY-004-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Governance and Leadership",
        "title": "Roles and responsibilities",
        "audity_objective": "Define who owns policies, risks, assets, exceptions, audits, and corrective actions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Governance and Leadership",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-005",
        "evidence_requirements": [
          "Policy register",
          "Approval records",
          "Procedure documents",
          "Review schedule"
        ],
        "question_ids": [
          "Q-ISO-RDY-005-01",
          "Q-ISO-RDY-005-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Policy and Procedure Management",
        "title": "Policy lifecycle",
        "audity_objective": "Keep security policies controlled, current, approved, and accessible.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Policy and Procedure Management",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-006",
        "evidence_requirements": [
          "Risk methodology",
          "Risk register sample",
          "Risk scoring guide",
          "Review records"
        ],
        "question_ids": [
          "Q-ISO-RDY-006-01",
          "Q-ISO-RDY-006-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Risk Management",
        "title": "Risk assessment method",
        "audity_objective": "Use a repeatable method for identifying and rating information security risk.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Risk Management",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-007",
        "evidence_requirements": [
          "Risk register",
          "Risk acceptance records",
          "Review dashboard",
          "Escalation evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-007-01",
          "Q-ISO-RDY-007-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Risk Management",
        "title": "Risk register operation",
        "audity_objective": "Keep security risks traceable from discovery through treatment or acceptance.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Risk Management",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-008",
        "evidence_requirements": [
          "Treatment plan",
          "Action tracker",
          "Budget or resource approval",
          "Closure evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-008-01",
          "Q-ISO-RDY-008-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Risk Management",
        "title": "Risk treatment plan",
        "audity_objective": "Convert risk decisions into funded, owned, and tracked actions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Risk Management",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-009",
        "evidence_requirements": [
          "Applicability register",
          "Control mapping export",
          "Exclusion justifications",
          "Management approval"
        ],
        "question_ids": [
          "Q-ISO-RDY-009-01",
          "Q-ISO-RDY-009-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Risk Management",
        "title": "Statement of Applicability readiness",
        "audity_objective": "Support an auditable explanation of which control areas are relevant, implemented, excluded, or planned.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Risk Management",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-010",
        "evidence_requirements": [
          "Asset inventory",
          "CMDB export",
          "Application register",
          "Ownership records"
        ],
        "question_ids": [
          "Q-ISO-RDY-010-01",
          "Q-ISO-RDY-010-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Asset and Information Handling",
        "title": "Asset inventory and ownership",
        "audity_objective": "Maintain enough inventory detail to assign responsibility and assess risk.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Asset and Information Handling",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-011",
        "evidence_requirements": [
          "Classification policy",
          "Data handling guide",
          "Sample labels",
          "Training record"
        ],
        "question_ids": [
          "Q-ISO-RDY-011-01",
          "Q-ISO-RDY-011-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Asset and Information Handling",
        "title": "Information classification",
        "audity_objective": "Classify information so handling, sharing, retention, and protection decisions are consistent.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Asset and Information Handling",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-012",
        "evidence_requirements": [
          "Acceptable use policy",
          "Endpoint baseline",
          "MDM/EDR configuration evidence",
          "User acknowledgement"
        ],
        "question_ids": [
          "Q-ISO-RDY-012-01",
          "Q-ISO-RDY-012-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Asset and Information Handling",
        "title": "Acceptable use and endpoint expectations",
        "audity_objective": "Set practical rules for user devices, software, storage, and remote work.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Asset and Information Handling",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-013",
        "evidence_requirements": [
          "IAM workflow",
          "HR-to-IT ticket samples",
          "Deprovisioning logs",
          "Exception records"
        ],
        "question_ids": [
          "Q-ISO-RDY-013-01",
          "Q-ISO-RDY-013-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Identity and Access",
        "title": "Identity lifecycle",
        "audity_objective": "Ensure access starts, changes, and ends in line with employment or contract status.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Identity and Access",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-014",
        "evidence_requirements": [
          "Privileged account list",
          "PAM records",
          "Admin log samples",
          "Access review evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-014-01",
          "Q-ISO-RDY-014-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Identity and Access",
        "title": "Privileged access management",
        "audity_objective": "Limit and monitor accounts that can change security, infrastructure, or sensitive data.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Identity and Access",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-015",
        "evidence_requirements": [
          "MFA policy",
          "Identity provider settings",
          "Dormant account report",
          "Default account remediation evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-015-01",
          "Q-ISO-RDY-015-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Identity and Access",
        "title": "Authentication baseline",
        "audity_objective": "Reduce account takeover risk through stronger authentication and password controls.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Identity and Access",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-016",
        "evidence_requirements": [
          "Access review campaign",
          "Reviewer sign-off",
          "Removal tickets",
          "Exception approvals"
        ],
        "question_ids": [
          "Q-ISO-RDY-016-01",
          "Q-ISO-RDY-016-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Identity and Access",
        "title": "Access review",
        "audity_objective": "Check periodically that users still need the access they hold.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Identity and Access",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-017",
        "evidence_requirements": [
          "Change tickets",
          "Security impact checklist",
          "Emergency change log",
          "Rollback evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-017-01",
          "Q-ISO-RDY-017-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Secure Operations",
        "title": "Change management",
        "audity_objective": "Control production changes enough to prevent avoidable security and availability incidents.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-018",
        "evidence_requirements": [
          "Scanner reports",
          "Patch dashboard",
          "Risk-based prioritization criteria",
          "Exception register"
        ],
        "question_ids": [
          "Q-ISO-RDY-018-01",
          "Q-ISO-RDY-018-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Secure Operations",
        "title": "Vulnerability and patch management",
        "audity_objective": "Find, prioritize, remediate, or formally accept technical weaknesses.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-019",
        "evidence_requirements": [
          "EDR/AV coverage report",
          "Hardening baseline",
          "Exclusion register",
          "Alert handling evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-019-01",
          "Q-ISO-RDY-019-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Secure Operations",
        "title": "Endpoint and malware protection",
        "audity_objective": "Protect endpoints and servers against common malicious activity and misuse.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-020",
        "evidence_requirements": [
          "Backup policy",
          "Backup job status",
          "Restore test report",
          "Recovery objective records"
        ],
        "question_ids": [
          "Q-ISO-RDY-020-01",
          "Q-ISO-RDY-020-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Resilience and Continuity",
        "title": "Backup and recovery",
        "audity_objective": "Ensure critical information and systems can be restored when needed.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Resilience and Continuity",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-021",
        "evidence_requirements": [
          "Log source inventory",
          "SIEM coverage report",
          "Use case list",
          "Gap tracker"
        ],
        "question_ids": [
          "Q-ISO-RDY-021-01",
          "Q-ISO-RDY-021-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Monitoring and Detection",
        "title": "Logging and monitoring coverage",
        "audity_objective": "Collect and review security-relevant events from important systems.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Monitoring and Detection",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-022",
        "evidence_requirements": [
          "Incident procedure",
          "Ticket samples",
          "Severity matrix",
          "Escalation log"
        ],
        "question_ids": [
          "Q-ISO-RDY-022-01",
          "Q-ISO-RDY-022-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Incident Management",
        "title": "Incident intake and triage",
        "audity_objective": "Make sure security events can be reported, classified, escalated, and tracked.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Incident Management",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-023",
        "evidence_requirements": [
          "Playbook library",
          "Exercise notes",
          "Post-incident review",
          "Improvement actions"
        ],
        "question_ids": [
          "Q-ISO-RDY-023-01",
          "Q-ISO-RDY-023-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Incident Management",
        "title": "Response playbooks",
        "audity_objective": "Prepare repeatable response steps for common security incident types.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Incident Management",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-024",
        "evidence_requirements": [
          "Supplier register",
          "Due diligence questionnaire",
          "Risk rating",
          "Review evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-024-01",
          "Q-ISO-RDY-024-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Supplier and Third-Party Security",
        "title": "Supplier security review",
        "audity_objective": "Assess supplier risk before and during the relationship.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Supplier and Third-Party Security",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-025",
        "evidence_requirements": [
          "Contract clauses",
          "NDA records",
          "External account list",
          "Offboarding evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-025-01",
          "Q-ISO-RDY-025-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Supplier and Third-Party Security",
        "title": "Contract and external access controls",
        "audity_objective": "Ensure external parties are bound by security expectations and access constraints.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Supplier and Third-Party Security",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "ISO-RDY-026",
        "evidence_requirements": [
          "Training plan",
          "Completion report",
          "Role-based material",
          "Phishing or exercise report"
        ],
        "question_ids": [
          "Q-ISO-RDY-026-01",
          "Q-ISO-RDY-026-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "People and Awareness",
        "title": "Security awareness and role training",
        "audity_objective": "Build practical security behavior for general users and higher-risk roles.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "People and Awareness",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-027",
        "evidence_requirements": [
          "Audit plan",
          "Audit checklist",
          "Finding register",
          "Corrective action evidence"
        ],
        "question_ids": [
          "Q-ISO-RDY-027-01",
          "Q-ISO-RDY-027-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Assurance and Improvement",
        "title": "Internal audit readiness",
        "audity_objective": "Check whether the security management approach is implemented and producing evidence.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Assurance and Improvement",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-028",
        "evidence_requirements": [
          "Management review agenda",
          "Metrics pack",
          "Meeting minutes",
          "Action log"
        ],
        "question_ids": [
          "Q-ISO-RDY-028-01",
          "Q-ISO-RDY-028-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Assurance and Improvement",
        "title": "Management review package",
        "audity_objective": "Give leadership a recurring view of risk, performance, incidents, nonconformities, and improvement needs.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Assurance and Improvement",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-029",
        "evidence_requirements": [
          "Corrective action register",
          "Root cause notes",
          "Closure evidence",
          "Effectiveness review"
        ],
        "question_ids": [
          "Q-ISO-RDY-029-01",
          "Q-ISO-RDY-029-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Assurance and Improvement",
        "title": "Corrective action tracking",
        "audity_objective": "Fix root causes instead of repeatedly treating symptoms.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Assurance and Improvement",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "ISO-RDY-030",
        "evidence_requirements": [
          "KPI/KRI dashboard",
          "Trend analysis",
          "Improvement roadmap",
          "Budget or planning records"
        ],
        "question_ids": [
          "Q-ISO-RDY-030-01",
          "Q-ISO-RDY-030-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "ISO/IEC 27001:2022",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Assurance and Improvement",
        "title": "Metrics and continual improvement",
        "audity_objective": "Use security data to prioritize improvement, not just to produce reports.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Assurance and Improvement",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      }
    ],
    "question_control_mappings": [
      {
        "question_id": "Q-ISO-RDY-001-01",
        "maps_to_control_ids": [
          "ISO-RDY-001"
        ],
        "preferred_evidence_types": [
          "Scope statement",
          "System/service inventory extract",
          "Boundary diagram"
        ],
        "question": "Is the business scope of the security management system documented in plain language?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-001-02",
        "maps_to_control_ids": [
          "ISO-RDY-001"
        ],
        "preferred_evidence_types": [
          "Scope statement",
          "System/service inventory extract",
          "Boundary diagram"
        ],
        "question": "Are excluded sites, teams, systems, and services explicitly listed with a reason?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-002-01",
        "maps_to_control_ids": [
          "ISO-RDY-002"
        ],
        "preferred_evidence_types": [
          "Requirement register",
          "Contract security clauses",
          "Regulatory applicability note"
        ],
        "question": "Are legal, contractual, customer, regulatory, and internal security obligations tracked?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-002-02",
        "maps_to_control_ids": [
          "ISO-RDY-002"
        ],
        "preferred_evidence_types": [
          "Requirement register",
          "Contract security clauses",
          "Regulatory applicability note"
        ],
        "question": "Is there an owner and review cadence for each obligation category?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-003-01",
        "maps_to_control_ids": [
          "ISO-RDY-003"
        ],
        "preferred_evidence_types": [
          "Role matrix",
          "Decision log",
          "Management meeting minutes"
        ],
        "question": "Is a senior owner accountable for security outcomes?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-003-02",
        "maps_to_control_ids": [
          "ISO-RDY-003"
        ],
        "preferred_evidence_types": [
          "Role matrix",
          "Decision log",
          "Management meeting minutes"
        ],
        "question": "Are key security decisions recorded with responsible roles and approval evidence?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-004-01",
        "maps_to_control_ids": [
          "ISO-RDY-004"
        ],
        "preferred_evidence_types": [
          "RACI matrix",
          "Control owner list",
          "Asset owner list"
        ],
        "question": "Are security responsibilities assigned for business, IT, operations, and third parties?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-004-02",
        "maps_to_control_ids": [
          "ISO-RDY-004"
        ],
        "preferred_evidence_types": [
          "RACI matrix",
          "Control owner list",
          "Asset owner list"
        ],
        "question": "Can asset owners and control owners be identified without manual investigation?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-005-01",
        "maps_to_control_ids": [
          "ISO-RDY-005"
        ],
        "preferred_evidence_types": [
          "Policy register",
          "Approval records",
          "Procedure documents"
        ],
        "question": "Are security policies versioned, approved, and reviewed on a planned cadence?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-005-02",
        "maps_to_control_ids": [
          "ISO-RDY-005"
        ],
        "preferred_evidence_types": [
          "Policy register",
          "Approval records",
          "Procedure documents"
        ],
        "question": "Do procedures translate policy expectations into operational steps?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-006-01",
        "maps_to_control_ids": [
          "ISO-RDY-006"
        ],
        "preferred_evidence_types": [
          "Risk methodology",
          "Risk register sample",
          "Risk scoring guide"
        ],
        "question": "Is the risk assessment method documented and understandable to non-specialists?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-006-02",
        "maps_to_control_ids": [
          "ISO-RDY-006"
        ],
        "preferred_evidence_types": [
          "Risk methodology",
          "Risk register sample",
          "Risk scoring guide"
        ],
        "question": "Are likelihood, impact, risk owner, treatment choice, and review date captured consistently?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-007-01",
        "maps_to_control_ids": [
          "ISO-RDY-007"
        ],
        "preferred_evidence_types": [
          "Risk register",
          "Risk acceptance records",
          "Review dashboard"
        ],
        "question": "Are active information security risks recorded in one controlled location?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-007-02",
        "maps_to_control_ids": [
          "ISO-RDY-007"
        ],
        "preferred_evidence_types": [
          "Risk register",
          "Risk acceptance records",
          "Review dashboard"
        ],
        "question": "Are overdue risk reviews, expired acceptances, and untreated high risks visible?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-008-01",
        "maps_to_control_ids": [
          "ISO-RDY-008"
        ],
        "preferred_evidence_types": [
          "Treatment plan",
          "Action tracker",
          "Budget or resource approval"
        ],
        "question": "Does each material risk have a treatment decision and target date?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-008-02",
        "maps_to_control_ids": [
          "ISO-RDY-008"
        ],
        "preferred_evidence_types": [
          "Treatment plan",
          "Action tracker",
          "Budget or resource approval"
        ],
        "question": "Are treatment actions tracked until verified as complete or formally accepted?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-009-01",
        "maps_to_control_ids": [
          "ISO-RDY-009"
        ],
        "preferred_evidence_types": [
          "Applicability register",
          "Control mapping export",
          "Exclusion justifications"
        ],
        "question": "Is there a control applicability view based on business context and risk?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-009-02",
        "maps_to_control_ids": [
          "ISO-RDY-009"
        ],
        "preferred_evidence_types": [
          "Applicability register",
          "Control mapping export",
          "Exclusion justifications"
        ],
        "question": "Are exclusions justified by risk, scope, or lack of applicability rather than convenience?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-010-01",
        "maps_to_control_ids": [
          "ISO-RDY-010"
        ],
        "preferred_evidence_types": [
          "Asset inventory",
          "CMDB export",
          "Application register"
        ],
        "question": "Are important information assets, applications, infrastructure components, and services inventoried?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-010-02",
        "maps_to_control_ids": [
          "ISO-RDY-010"
        ],
        "preferred_evidence_types": [
          "Asset inventory",
          "CMDB export",
          "Application register"
        ],
        "question": "Does each critical asset have a business owner and technical owner?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-011-01",
        "maps_to_control_ids": [
          "ISO-RDY-011"
        ],
        "preferred_evidence_types": [
          "Classification policy",
          "Data handling guide",
          "Sample labels"
        ],
        "question": "Are information classes or sensitivity levels defined for the organization?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-011-02",
        "maps_to_control_ids": [
          "ISO-RDY-011"
        ],
        "preferred_evidence_types": [
          "Classification policy",
          "Data handling guide",
          "Sample labels"
        ],
        "question": "Do users know how to handle sensitive information in storage, transmission, and disposal?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-012-01",
        "maps_to_control_ids": [
          "ISO-RDY-012"
        ],
        "preferred_evidence_types": [
          "Acceptable use policy",
          "Endpoint baseline",
          "MDM/EDR configuration evidence"
        ],
        "question": "Are acceptable-use expectations documented for employees and contractors?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-012-02",
        "maps_to_control_ids": [
          "ISO-RDY-012"
        ],
        "preferred_evidence_types": [
          "Acceptable use policy",
          "Endpoint baseline",
          "MDM/EDR configuration evidence"
        ],
        "question": "Are endpoint security expectations communicated and technically enforced where possible?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-013-01",
        "maps_to_control_ids": [
          "ISO-RDY-013"
        ],
        "preferred_evidence_types": [
          "IAM workflow",
          "HR-to-IT ticket samples",
          "Deprovisioning logs"
        ],
        "question": "Is joiner, mover, and leaver access handled through a defined workflow?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-013-02",
        "maps_to_control_ids": [
          "ISO-RDY-013"
        ],
        "preferred_evidence_types": [
          "IAM workflow",
          "HR-to-IT ticket samples",
          "Deprovisioning logs"
        ],
        "question": "Are terminations and role changes completed within documented time expectations?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-014-01",
        "maps_to_control_ids": [
          "ISO-RDY-014"
        ],
        "preferred_evidence_types": [
          "Privileged account list",
          "PAM records",
          "Admin log samples"
        ],
        "question": "Are privileged accounts separated from normal user accounts?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-014-02",
        "maps_to_control_ids": [
          "ISO-RDY-014"
        ],
        "preferred_evidence_types": [
          "Privileged account list",
          "PAM records",
          "Admin log samples"
        ],
        "question": "Are administrative actions traceable to an individual and reviewed when needed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-015-01",
        "maps_to_control_ids": [
          "ISO-RDY-015"
        ],
        "preferred_evidence_types": [
          "MFA policy",
          "Identity provider settings",
          "Dormant account report"
        ],
        "question": "Is MFA required for remote access, cloud administration, and privileged activities?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-015-02",
        "maps_to_control_ids": [
          "ISO-RDY-015"
        ],
        "preferred_evidence_types": [
          "MFA policy",
          "Identity provider settings",
          "Dormant account report"
        ],
        "question": "Are weak, shared, dormant, and default accounts detected and removed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-016-01",
        "maps_to_control_ids": [
          "ISO-RDY-016"
        ],
        "preferred_evidence_types": [
          "Access review campaign",
          "Reviewer sign-off",
          "Removal tickets"
        ],
        "question": "Are access reviews performed for sensitive systems and privileged roles?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-016-02",
        "maps_to_control_ids": [
          "ISO-RDY-016"
        ],
        "preferred_evidence_types": [
          "Access review campaign",
          "Reviewer sign-off",
          "Removal tickets"
        ],
        "question": "Are review findings converted into completed removals or approved exceptions?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-017-01",
        "maps_to_control_ids": [
          "ISO-RDY-017"
        ],
        "preferred_evidence_types": [
          "Change tickets",
          "Security impact checklist",
          "Emergency change log"
        ],
        "question": "Are security-relevant changes assessed before implementation?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-017-02",
        "maps_to_control_ids": [
          "ISO-RDY-017"
        ],
        "preferred_evidence_types": [
          "Change tickets",
          "Security impact checklist",
          "Emergency change log"
        ],
        "question": "Can emergency changes be reviewed after the fact with accountable approval?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-018-01",
        "maps_to_control_ids": [
          "ISO-RDY-018"
        ],
        "preferred_evidence_types": [
          "Scanner reports",
          "Patch dashboard",
          "Risk-based prioritization criteria"
        ],
        "question": "Are vulnerabilities prioritized using business criticality and exploitability, not only raw severity?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-018-02",
        "maps_to_control_ids": [
          "ISO-RDY-018"
        ],
        "preferred_evidence_types": [
          "Scanner reports",
          "Patch dashboard",
          "Risk-based prioritization criteria"
        ],
        "question": "Are overdue remediation items visible to asset owners and management?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-019-01",
        "maps_to_control_ids": [
          "ISO-RDY-019"
        ],
        "preferred_evidence_types": [
          "EDR/AV coverage report",
          "Hardening baseline",
          "Exclusion register"
        ],
        "question": "Are managed endpoints covered by protection, hardening, and monitoring controls?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-019-02",
        "maps_to_control_ids": [
          "ISO-RDY-019"
        ],
        "preferred_evidence_types": [
          "EDR/AV coverage report",
          "Hardening baseline",
          "Exclusion register"
        ],
        "question": "Are protection exclusions approved, time-limited, and reviewed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-020-01",
        "maps_to_control_ids": [
          "ISO-RDY-020"
        ],
        "preferred_evidence_types": [
          "Backup policy",
          "Backup job status",
          "Restore test report"
        ],
        "question": "Are critical systems and data included in a backup schedule based on business need?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-020-02",
        "maps_to_control_ids": [
          "ISO-RDY-020"
        ],
        "preferred_evidence_types": [
          "Backup policy",
          "Backup job status",
          "Restore test report"
        ],
        "question": "Are restore tests performed and recorded for important systems?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-021-01",
        "maps_to_control_ids": [
          "ISO-RDY-021"
        ],
        "preferred_evidence_types": [
          "Log source inventory",
          "SIEM coverage report",
          "Use case list"
        ],
        "question": "Are critical systems, identity platforms, and security tools sending usable logs to a monitored location?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-021-02",
        "maps_to_control_ids": [
          "ISO-RDY-021"
        ],
        "preferred_evidence_types": [
          "Log source inventory",
          "SIEM coverage report",
          "Use case list"
        ],
        "question": "Are monitoring gaps documented and prioritized?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-022-01",
        "maps_to_control_ids": [
          "ISO-RDY-022"
        ],
        "preferred_evidence_types": [
          "Incident procedure",
          "Ticket samples",
          "Severity matrix"
        ],
        "question": "Is there a clear channel for reporting suspected security incidents?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-022-02",
        "maps_to_control_ids": [
          "ISO-RDY-022"
        ],
        "preferred_evidence_types": [
          "Incident procedure",
          "Ticket samples",
          "Severity matrix"
        ],
        "question": "Are incidents triaged using severity, business impact, and containment urgency?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-023-01",
        "maps_to_control_ids": [
          "ISO-RDY-023"
        ],
        "preferred_evidence_types": [
          "Playbook library",
          "Exercise notes",
          "Post-incident review"
        ],
        "question": "Are playbooks available for likely incidents such as phishing, malware, account compromise, and data exposure?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-023-02",
        "maps_to_control_ids": [
          "ISO-RDY-023"
        ],
        "preferred_evidence_types": [
          "Playbook library",
          "Exercise notes",
          "Post-incident review"
        ],
        "question": "Are lessons learned converted into control improvements?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-024-01",
        "maps_to_control_ids": [
          "ISO-RDY-024"
        ],
        "preferred_evidence_types": [
          "Supplier register",
          "Due diligence questionnaire",
          "Risk rating"
        ],
        "question": "Are suppliers with access to sensitive information or critical services security-reviewed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-024-02",
        "maps_to_control_ids": [
          "ISO-RDY-024"
        ],
        "preferred_evidence_types": [
          "Supplier register",
          "Due diligence questionnaire",
          "Risk rating"
        ],
        "question": "Are high-risk suppliers reviewed more deeply than low-risk suppliers?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-025-01",
        "maps_to_control_ids": [
          "ISO-RDY-025"
        ],
        "preferred_evidence_types": [
          "Contract clauses",
          "NDA records",
          "External account list"
        ],
        "question": "Do contracts define security, confidentiality, incident notification, and access expectations?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-025-02",
        "maps_to_control_ids": [
          "ISO-RDY-025"
        ],
        "preferred_evidence_types": [
          "Contract clauses",
          "NDA records",
          "External account list"
        ],
        "question": "Is external access removed when supplier engagement ends?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-026-01",
        "maps_to_control_ids": [
          "ISO-RDY-026"
        ],
        "preferred_evidence_types": [
          "Training plan",
          "Completion report",
          "Role-based material"
        ],
        "question": "Do users receive security awareness suitable for their actual work?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-026-02",
        "maps_to_control_ids": [
          "ISO-RDY-026"
        ],
        "preferred_evidence_types": [
          "Training plan",
          "Completion report",
          "Role-based material"
        ],
        "question": "Do privileged users, developers, administrators, and incident handlers receive role-specific guidance?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-027-01",
        "maps_to_control_ids": [
          "ISO-RDY-027"
        ],
        "preferred_evidence_types": [
          "Audit plan",
          "Audit checklist",
          "Finding register"
        ],
        "question": "Is an internal audit plan defined for the assessed scope?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-027-02",
        "maps_to_control_ids": [
          "ISO-RDY-027"
        ],
        "preferred_evidence_types": [
          "Audit plan",
          "Audit checklist",
          "Finding register"
        ],
        "question": "Are findings tracked to corrective actions and closure evidence?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-028-01",
        "maps_to_control_ids": [
          "ISO-RDY-028"
        ],
        "preferred_evidence_types": [
          "Management review agenda",
          "Metrics pack",
          "Meeting minutes"
        ],
        "question": "Does management regularly review security performance and risk status?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-028-02",
        "maps_to_control_ids": [
          "ISO-RDY-028"
        ],
        "preferred_evidence_types": [
          "Management review agenda",
          "Metrics pack",
          "Meeting minutes"
        ],
        "question": "Are decisions, resource needs, and actions recorded?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-029-01",
        "maps_to_control_ids": [
          "ISO-RDY-029"
        ],
        "preferred_evidence_types": [
          "Corrective action register",
          "Root cause notes",
          "Closure evidence"
        ],
        "question": "Are nonconformities, audit findings, incidents, and recurring issues tracked as corrective actions?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-029-02",
        "maps_to_control_ids": [
          "ISO-RDY-029"
        ],
        "preferred_evidence_types": [
          "Corrective action register",
          "Root cause notes",
          "Closure evidence"
        ],
        "question": "Is effectiveness checked after closure?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-030-01",
        "maps_to_control_ids": [
          "ISO-RDY-030"
        ],
        "preferred_evidence_types": [
          "KPI/KRI dashboard",
          "Trend analysis",
          "Improvement roadmap"
        ],
        "question": "Are measurable security indicators defined for the assessed scope?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-ISO-RDY-030-02",
        "maps_to_control_ids": [
          "ISO-RDY-030"
        ],
        "preferred_evidence_types": [
          "KPI/KRI dashboard",
          "Trend analysis",
          "Improvement roadmap"
        ],
        "question": "Are trends used to adjust priorities and investments?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      }
    ],
    "display_name": "ISO/IEC 27001:2022 Readiness Workflow",
    "delivery_mode": "Audity-native readiness workflow plus tenant-provided licensed content import",
    "content_class": "audity_native_assessment_content",
    "content_status": "Supported through Audity readiness workflow. Official ISO/IEC 27001 standard text is not included.",
    "official_standard_text_included": false,
    "official_control_catalogue_included": false,
    "redistribution_note": "This pack uses original Audity wording only. It is not a copy, extract, paraphrase, translation, or reconstructed catalogue of proprietary standards content.",
    "licensed_content_import_supported": true
  },
  {
    "framework_id": "audity.iec62443.readiness",
    "domains": [
      {
        "domain_id": "OT-GOVERNANCE-AND-SCOPE",
        "name": "OT Governance and Scope",
        "description": "Audity readiness domain for ot governance and scope activities."
      },
      {
        "domain_id": "OT-ASSET-AND-ARCHITECTURE",
        "name": "OT Asset and Architecture",
        "description": "Audity readiness domain for ot asset and architecture activities."
      },
      {
        "domain_id": "ZONES-AND-CONDUITS",
        "name": "Zones and Conduits",
        "description": "Audity readiness domain for zones and conduits activities."
      },
      {
        "domain_id": "OT-IDENTITY-AND-REMOTE-ACCESS",
        "name": "OT Identity and Remote Access",
        "description": "Audity readiness domain for ot identity and remote access activities."
      },
      {
        "domain_id": "OT-SECURE-OPERATIONS",
        "name": "OT Secure Operations",
        "description": "Audity readiness domain for ot secure operations activities."
      },
      {
        "domain_id": "OT-BACKUP-AND-RECOVERY",
        "name": "OT Backup and Recovery",
        "description": "Audity readiness domain for ot backup and recovery activities."
      },
      {
        "domain_id": "OT-VULNERABILITY-AND-PATCH",
        "name": "OT Vulnerability and Patch",
        "description": "Audity readiness domain for ot vulnerability and patch activities."
      },
      {
        "domain_id": "OT-MONITORING-AND-RESPONSE",
        "name": "OT Monitoring and Response",
        "description": "Audity readiness domain for ot monitoring and response activities."
      },
      {
        "domain_id": "SAFETY-AND-ENGINEERING-COORDINATION",
        "name": "Safety and Engineering Coordination",
        "description": "Audity readiness domain for safety and engineering coordination activities."
      },
      {
        "domain_id": "SUPPLIER-AND-LIFECYCLE-SECURITY",
        "name": "Supplier and Lifecycle Security",
        "description": "Audity readiness domain for supplier and lifecycle security activities."
      },
      {
        "domain_id": "PEOPLE-AND-OT-CULTURE",
        "name": "People and OT Culture",
        "description": "Audity readiness domain for people and ot culture activities."
      }
    ],
    "controls": [
      {
        "control_id": "IEC-RDY-001",
        "evidence_requirements": [
          "OT scope map",
          "Process criticality register",
          "Site list",
          "Business impact notes"
        ],
        "question_ids": [
          "Q-IEC-RDY-001-01",
          "Q-IEC-RDY-001-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Governance and Scope",
        "title": "OT scope and process criticality",
        "audity_objective": "Define which industrial processes, locations, systems, and operational boundaries are in scope.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Governance and Scope",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-002",
        "evidence_requirements": [
          "OT RACI",
          "Plant owner list",
          "Security governance minutes",
          "Supplier responsibility matrix"
        ],
        "question_ids": [
          "Q-IEC-RDY-002-01",
          "Q-IEC-RDY-002-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Governance and Scope",
        "title": "OT cybersecurity ownership",
        "audity_objective": "Assign accountable owners across operations, engineering, IT, security, and suppliers.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Governance and Scope",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-003",
        "evidence_requirements": [
          "Meeting cadence",
          "Decision log",
          "Risk acceptance notes",
          "Action tracker"
        ],
        "question_ids": [
          "Q-IEC-RDY-003-01",
          "Q-IEC-RDY-003-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Governance and Scope",
        "title": "IT/OT decision forum",
        "audity_objective": "Create a practical forum for approving cyber changes that may affect safety, uptime, or engineering workflows.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Governance and Scope",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-004",
        "evidence_requirements": [
          "OT asset inventory",
          "Network discovery output",
          "Manual plant inventory",
          "Owner assignment records"
        ],
        "question_ids": [
          "Q-IEC-RDY-004-01",
          "Q-IEC-RDY-004-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Asset and Architecture",
        "title": "OT asset inventory",
        "audity_objective": "Maintain an inventory of systems that support or control industrial operations.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Asset and Architecture",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-005",
        "evidence_requirements": [
          "Criticality model",
          "Asset tags",
          "Process hazard references",
          "Change approval samples"
        ],
        "question_ids": [
          "Q-IEC-RDY-005-01",
          "Q-IEC-RDY-005-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Asset and Architecture",
        "title": "Safety and process impact tagging",
        "audity_objective": "Tag assets and functions by operational consequence to guide priority and change constraints.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Asset and Architecture",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-006",
        "evidence_requirements": [
          "Network diagrams",
          "Data flow notes",
          "Firewall/router exports",
          "Remote access diagram"
        ],
        "question_ids": [
          "Q-IEC-RDY-006-01",
          "Q-IEC-RDY-006-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Asset and Architecture",
        "title": "Network architecture documentation",
        "audity_objective": "Document how OT systems communicate with each other and with business or cloud systems.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Asset and Architecture",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-007",
        "evidence_requirements": [
          "Zone model",
          "Asset-to-zone mapping",
          "Architecture decision records",
          "Segmentation plan"
        ],
        "question_ids": [
          "Q-IEC-RDY-007-01",
          "Q-IEC-RDY-007-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Zones and Conduits",
        "title": "Security zone model",
        "audity_objective": "Group OT systems by trust level, function, and operational dependency.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Zones and Conduits",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-008",
        "evidence_requirements": [
          "Firewall rules",
          "Allow-list",
          "Temporary access records",
          "Traffic review evidence"
        ],
        "question_ids": [
          "Q-IEC-RDY-008-01",
          "Q-IEC-RDY-008-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Zones and Conduits",
        "title": "Controlled communication paths",
        "audity_objective": "Restrict traffic between OT areas to defined, approved, and monitored paths.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Zones and Conduits",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-009",
        "evidence_requirements": [
          "Change tickets",
          "Firewall change history",
          "Emergency review log",
          "Approval evidence"
        ],
        "question_ids": [
          "Q-IEC-RDY-009-01",
          "Q-IEC-RDY-009-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Zones and Conduits",
        "title": "Boundary change control",
        "audity_objective": "Protect OT network boundaries from undocumented or emergency-driven drift.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "Zones and Conduits",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-010",
        "evidence_requirements": [
          "Remote access policy",
          "Approval tickets",
          "VPN/session logs",
          "Access scope records"
        ],
        "question_ids": [
          "Q-IEC-RDY-010-01",
          "Q-IEC-RDY-010-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Identity and Remote Access",
        "title": "Remote access approval",
        "audity_objective": "Control who can remotely reach OT systems and under which conditions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Identity and Remote Access",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-011",
        "evidence_requirements": [
          "Vendor access register",
          "Session recordings or logs",
          "Supplier offboarding evidence",
          "Emergency contact list"
        ],
        "question_ids": [
          "Q-IEC-RDY-011-01",
          "Q-IEC-RDY-011-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Identity and Remote Access",
        "title": "Vendor session oversight",
        "audity_objective": "Make supplier access visible, attributable, and revocable.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Identity and Remote Access",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-012",
        "evidence_requirements": [
          "Account inventory",
          "Password vault records",
          "Default account remediation",
          "Compensating control notes"
        ],
        "question_ids": [
          "Q-IEC-RDY-012-01",
          "Q-IEC-RDY-012-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Identity and Remote Access",
        "title": "Local and shared account control",
        "audity_objective": "Reduce untraceable access from shared, default, or unmanaged accounts.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Identity and Remote Access",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-013",
        "evidence_requirements": [
          "HMI baseline",
          "EDR/AV compatibility test",
          "Software inventory",
          "Hardening evidence"
        ],
        "question_ids": [
          "Q-IEC-RDY-013-01",
          "Q-IEC-RDY-013-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Secure Operations",
        "title": "Operator workstation protection",
        "audity_objective": "Protect HMI and operator workstations without disrupting production needs.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-014",
        "evidence_requirements": [
          "Engineering workstation baseline",
          "Project repository controls",
          "Access list",
          "Change logs"
        ],
        "question_ids": [
          "Q-IEC-RDY-014-01",
          "Q-IEC-RDY-014-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Secure Operations",
        "title": "Engineering workstation protection",
        "audity_objective": "Secure systems used to modify automation logic, recipes, configuration, or firmware.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-015",
        "evidence_requirements": [
          "Removable media procedure",
          "Scanning kiosk logs",
          "Exception records",
          "User guidance"
        ],
        "question_ids": [
          "Q-IEC-RDY-015-01",
          "Q-IEC-RDY-015-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Secure Operations",
        "title": "Removable media handling",
        "audity_objective": "Control USB, laptops, portable engineering media, and file transfers into OT environments.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-016",
        "evidence_requirements": [
          "Backup inventory",
          "Controller project backup",
          "Offline/immutable backup evidence",
          "Backup access controls"
        ],
        "question_ids": [
          "Q-IEC-RDY-016-01",
          "Q-IEC-RDY-016-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Backup and Recovery",
        "title": "Controller and configuration backups",
        "audity_objective": "Preserve recoverable copies of automation logic, recipes, configurations, and supporting systems.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Backup and Recovery",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-017",
        "evidence_requirements": [
          "Restore test report",
          "Recovery runbook",
          "Lessons learned",
          "Recovery timing records"
        ],
        "question_ids": [
          "Q-IEC-RDY-017-01",
          "Q-IEC-RDY-017-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Backup and Recovery",
        "title": "OT restore testing",
        "audity_objective": "Verify that restoration works under realistic operational constraints.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Backup and Recovery",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-018",
        "evidence_requirements": [
          "Patch review board notes",
          "Test results",
          "Patch exception register",
          "Maintenance window plan"
        ],
        "question_ids": [
          "Q-IEC-RDY-018-01",
          "Q-IEC-RDY-018-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Vulnerability and Patch",
        "title": "Patch governance for OT",
        "audity_objective": "Handle patching with safety, uptime, vendor support, and test requirements in mind.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Vulnerability and Patch",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-019",
        "evidence_requirements": [
          "Vulnerability dashboard",
          "Triage notes",
          "Vendor advisories",
          "Risk decisions"
        ],
        "question_ids": [
          "Q-IEC-RDY-019-01",
          "Q-IEC-RDY-019-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Vulnerability and Patch",
        "title": "Vulnerability intake and triage",
        "audity_objective": "Translate vulnerability findings into OT-specific risk decisions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Vulnerability and Patch",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-020",
        "evidence_requirements": [
          "Legacy asset list",
          "Compensating control register",
          "Segmentation evidence",
          "Monitoring rules"
        ],
        "question_ids": [
          "Q-IEC-RDY-020-01",
          "Q-IEC-RDY-020-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Vulnerability and Patch",
        "title": "Legacy system compensating controls",
        "audity_objective": "Protect systems that cannot be modernized quickly or safely.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Vulnerability and Patch",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-021",
        "evidence_requirements": [
          "Baseline document",
          "Configuration export",
          "Deviation report",
          "Approval record"
        ],
        "question_ids": [
          "Q-IEC-RDY-021-01",
          "Q-IEC-RDY-021-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Secure Operations",
        "title": "Secure configuration baseline",
        "audity_objective": "Define and protect known-good configurations for OT infrastructure and endpoints.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Secure Operations",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-022",
        "evidence_requirements": [
          "OT monitoring inventory",
          "Sensor coverage map",
          "Alert samples",
          "Traffic review notes"
        ],
        "question_ids": [
          "Q-IEC-RDY-022-01",
          "Q-IEC-RDY-022-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Monitoring and Response",
        "title": "OT network visibility",
        "audity_objective": "Detect unusual or unauthorized communication in OT environments.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Monitoring and Response",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-023",
        "evidence_requirements": [
          "Log source list",
          "SIEM ingestion evidence",
          "Jump host logs",
          "Gap register"
        ],
        "question_ids": [
          "Q-IEC-RDY-023-01",
          "Q-IEC-RDY-023-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Monitoring and Response",
        "title": "Log collection from supporting systems",
        "audity_objective": "Collect useful evidence from systems that can be logged safely.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Monitoring and Response",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-024",
        "evidence_requirements": [
          "Detection catalogue",
          "Use case test results",
          "Alert tuning notes",
          "SOC handover records"
        ],
        "question_ids": [
          "Q-IEC-RDY-024-01",
          "Q-IEC-RDY-024-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Monitoring and Response",
        "title": "OT detection use cases",
        "audity_objective": "Create detection logic for realistic OT attack and misuse scenarios.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "OT Monitoring and Response",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-025",
        "evidence_requirements": [
          "OT incident playbook",
          "Exercise report",
          "Call tree",
          "Decision authority matrix"
        ],
        "question_ids": [
          "Q-IEC-RDY-025-01",
          "Q-IEC-RDY-025-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "OT Monitoring and Response",
        "title": "OT incident response",
        "audity_objective": "Prepare incident response steps that protect people, environment, and production before normal IT recovery assumptions.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": true,
          "domain_heatmap": "OT Monitoring and Response",
          "evidence_appendix": true,
          "priority_gap_candidate": true
        }
      },
      {
        "control_id": "IEC-RDY-026",
        "evidence_requirements": [
          "Escalation matrix",
          "Safety contact list",
          "Incident command notes",
          "Exercise evidence"
        ],
        "question_ids": [
          "Q-IEC-RDY-026-01",
          "Q-IEC-RDY-026-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Safety and Engineering Coordination",
        "title": "Safety-aware escalation",
        "audity_objective": "Ensure cyber decisions during incidents do not accidentally create safety or process hazards.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Safety and Engineering Coordination",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-027",
        "evidence_requirements": [
          "Supplier clauses",
          "Procurement checklist",
          "Service agreement",
          "Supplier risk review"
        ],
        "question_ids": [
          "Q-IEC-RDY-027-01",
          "Q-IEC-RDY-027-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Supplier and Lifecycle Security",
        "title": "Supplier security requirements",
        "audity_objective": "Set cybersecurity expectations for vendors, integrators, and service providers before work starts.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Supplier and Lifecycle Security",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-028",
        "evidence_requirements": [
          "Procurement requirement checklist",
          "Factory/site acceptance test notes",
          "Design review",
          "Go-live approval"
        ],
        "question_ids": [
          "Q-IEC-RDY-028-01",
          "Q-IEC-RDY-028-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Supplier and Lifecycle Security",
        "title": "Secure procurement and acceptance",
        "audity_objective": "Assess new OT systems and changes before they enter production.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Supplier and Lifecycle Security",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-029",
        "evidence_requirements": [
          "Automation change ticket",
          "Logic version history",
          "Engineering tool logs",
          "Rollback plan"
        ],
        "question_ids": [
          "Q-IEC-RDY-029-01",
          "Q-IEC-RDY-029-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "Safety and Engineering Coordination",
        "title": "Automation change management",
        "audity_objective": "Control changes to logic, recipes, firmware, network settings, and engineering tools.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "Safety and Engineering Coordination",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      },
      {
        "control_id": "IEC-RDY-030",
        "evidence_requirements": [
          "Training material",
          "Attendance records",
          "Tabletop exercise",
          "Role-based guidance"
        ],
        "question_ids": [
          "Q-IEC-RDY-030-01",
          "Q-IEC-RDY-030-02"
        ],
        "licensed_framework_mapping_slots": [
          {
            "framework_family": "IEC 62443 series",
            "official_text_included": false,
            "tenant_reference_id": null,
            "tenant_control_title": null,
            "tenant_import_source": "tenant_provided_licensed_content_only",
            "mapping_status": "empty_until_tenant_imports_licensed_content"
          }
        ],
        "domain": "People and OT Culture",
        "title": "OT security training",
        "audity_objective": "Give engineers, operators, maintenance staff, and security teams practical guidance for OT-specific risk.",
        "default_weight": "1.0",
        "criticality_hint": "raise weight for crown-jewel, regulated, customer-facing, privileged, safety-relevant, or production-critical scope",
        "readiness_pass_condition": "average_question_score >= 3 and at least one relevant evidence item approved",
        "gap_condition": "average_question_score <= 2 or required evidence is absent, stale, rejected, or unverifiable",
        "report_mapping": {
          "executive_summary": false,
          "domain_heatmap": "People and OT Culture",
          "evidence_appendix": true,
          "priority_gap_candidate": false
        }
      }
    ],
    "question_control_mappings": [
      {
        "question_id": "Q-IEC-RDY-001-01",
        "maps_to_control_ids": [
          "IEC-RDY-001"
        ],
        "preferred_evidence_types": [
          "OT scope map",
          "Process criticality register",
          "Site list"
        ],
        "question": "Are plants, lines, cells, systems, and remote sites included or excluded from the OT assessment scope?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-001-02",
        "maps_to_control_ids": [
          "IEC-RDY-001"
        ],
        "preferred_evidence_types": [
          "OT scope map",
          "Process criticality register",
          "Site list"
        ],
        "question": "Are safety, production, quality, and environmental impacts considered when rating criticality?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-002-01",
        "maps_to_control_ids": [
          "IEC-RDY-002"
        ],
        "preferred_evidence_types": [
          "OT RACI",
          "Plant owner list",
          "Security governance minutes"
        ],
        "question": "Are OT security responsibilities formally assigned across IT and operations?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-002-02",
        "maps_to_control_ids": [
          "IEC-RDY-002"
        ],
        "preferred_evidence_types": [
          "OT RACI",
          "Plant owner list",
          "Security governance minutes"
        ],
        "question": "Is there a named owner for risk decisions affecting production environments?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-003-01",
        "maps_to_control_ids": [
          "IEC-RDY-003"
        ],
        "preferred_evidence_types": [
          "Meeting cadence",
          "Decision log",
          "Risk acceptance notes"
        ],
        "question": "Is there a regular forum where IT, security, engineering, and operations review OT security topics?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-003-02",
        "maps_to_control_ids": [
          "IEC-RDY-003"
        ],
        "preferred_evidence_types": [
          "Meeting cadence",
          "Decision log",
          "Risk acceptance notes"
        ],
        "question": "Are exceptions and risk acceptances approved with production impact in mind?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-004-01",
        "maps_to_control_ids": [
          "IEC-RDY-004"
        ],
        "preferred_evidence_types": [
          "OT asset inventory",
          "Network discovery output",
          "Manual plant inventory"
        ],
        "question": "Are controllers, HMIs, engineering workstations, servers, network devices, and supporting services inventoried?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-004-02",
        "maps_to_control_ids": [
          "IEC-RDY-004"
        ],
        "preferred_evidence_types": [
          "OT asset inventory",
          "Network discovery output",
          "Manual plant inventory"
        ],
        "question": "Does the inventory include owner, location, function, vendor, version, and criticality where known?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-005-01",
        "maps_to_control_ids": [
          "IEC-RDY-005"
        ],
        "preferred_evidence_types": [
          "Criticality model",
          "Asset tags",
          "Process hazard references"
        ],
        "question": "Are assets tagged by potential impact on safety, production, quality, or environment?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-005-02",
        "maps_to_control_ids": [
          "IEC-RDY-005"
        ],
        "preferred_evidence_types": [
          "Criticality model",
          "Asset tags",
          "Process hazard references"
        ],
        "question": "Are high-impact assets subject to stricter change and access controls?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-006-01",
        "maps_to_control_ids": [
          "IEC-RDY-006"
        ],
        "preferred_evidence_types": [
          "Network diagrams",
          "Data flow notes",
          "Firewall/router exports"
        ],
        "question": "Is the OT network architecture documented at a level useful for security decisions?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-006-02",
        "maps_to_control_ids": [
          "IEC-RDY-006"
        ],
        "preferred_evidence_types": [
          "Network diagrams",
          "Data flow notes",
          "Firewall/router exports"
        ],
        "question": "Are internet, corporate network, wireless, cellular, and vendor connectivity paths visible?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-007-01",
        "maps_to_control_ids": [
          "IEC-RDY-007"
        ],
        "preferred_evidence_types": [
          "Zone model",
          "Asset-to-zone mapping",
          "Architecture decision records"
        ],
        "question": "Are OT systems grouped into security zones or equivalent trust areas?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-007-02",
        "maps_to_control_ids": [
          "IEC-RDY-007"
        ],
        "preferred_evidence_types": [
          "Zone model",
          "Asset-to-zone mapping",
          "Architecture decision records"
        ],
        "question": "Are zone boundaries based on function, criticality, and communication need rather than network convenience only?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-008-01",
        "maps_to_control_ids": [
          "IEC-RDY-008"
        ],
        "preferred_evidence_types": [
          "Firewall rules",
          "Allow-list",
          "Temporary access records"
        ],
        "question": "Are allowed communications between zones documented and technically enforced?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-008-02",
        "maps_to_control_ids": [
          "IEC-RDY-008"
        ],
        "preferred_evidence_types": [
          "Firewall rules",
          "Allow-list",
          "Temporary access records"
        ],
        "question": "Are temporary openings time-limited and reviewed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-009-01",
        "maps_to_control_ids": [
          "IEC-RDY-009"
        ],
        "preferred_evidence_types": [
          "Change tickets",
          "Firewall change history",
          "Emergency review log"
        ],
        "question": "Are firewall, routing, VPN, and remote access changes reviewed before implementation?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-009-02",
        "maps_to_control_ids": [
          "IEC-RDY-009"
        ],
        "preferred_evidence_types": [
          "Change tickets",
          "Firewall change history",
          "Emergency review log"
        ],
        "question": "Are emergency boundary changes reviewed after the fact and closed or formalized?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-010-01",
        "maps_to_control_ids": [
          "IEC-RDY-010"
        ],
        "preferred_evidence_types": [
          "Remote access policy",
          "Approval tickets",
          "VPN/session logs"
        ],
        "question": "Is remote access to OT systems approved by an accountable OT owner?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-010-02",
        "maps_to_control_ids": [
          "IEC-RDY-010"
        ],
        "preferred_evidence_types": [
          "Remote access policy",
          "Approval tickets",
          "VPN/session logs"
        ],
        "question": "Are remote sessions limited by time, identity, purpose, and destination?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-011-01",
        "maps_to_control_ids": [
          "IEC-RDY-011"
        ],
        "preferred_evidence_types": [
          "Vendor access register",
          "Session recordings or logs",
          "Supplier offboarding evidence"
        ],
        "question": "Are vendor remote sessions individually approved or supervised for sensitive environments?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-011-02",
        "maps_to_control_ids": [
          "IEC-RDY-011"
        ],
        "preferred_evidence_types": [
          "Vendor access register",
          "Session recordings or logs",
          "Supplier offboarding evidence"
        ],
        "question": "Can supplier access be disabled quickly when no longer needed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-012-01",
        "maps_to_control_ids": [
          "IEC-RDY-012"
        ],
        "preferred_evidence_types": [
          "Account inventory",
          "Password vault records",
          "Default account remediation"
        ],
        "question": "Are default and shared accounts identified on OT systems where technically possible?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-012-02",
        "maps_to_control_ids": [
          "IEC-RDY-012"
        ],
        "preferred_evidence_types": [
          "Account inventory",
          "Password vault records",
          "Default account remediation"
        ],
        "question": "Are compensating controls documented where unique accounts cannot be implemented?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-013-01",
        "maps_to_control_ids": [
          "IEC-RDY-013"
        ],
        "preferred_evidence_types": [
          "HMI baseline",
          "EDR/AV compatibility test",
          "Software inventory"
        ],
        "question": "Are operator workstations hardened to remove unnecessary software and services?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-013-02",
        "maps_to_control_ids": [
          "IEC-RDY-013"
        ],
        "preferred_evidence_types": [
          "HMI baseline",
          "EDR/AV compatibility test",
          "Software inventory"
        ],
        "question": "Are malware protection and application controls configured in a way tested for production compatibility?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-014-01",
        "maps_to_control_ids": [
          "IEC-RDY-014"
        ],
        "preferred_evidence_types": [
          "Engineering workstation baseline",
          "Project repository controls",
          "Access list"
        ],
        "question": "Are engineering workstations restricted to authorized engineering tasks and users?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-014-02",
        "maps_to_control_ids": [
          "IEC-RDY-014"
        ],
        "preferred_evidence_types": [
          "Engineering workstation baseline",
          "Project repository controls",
          "Access list"
        ],
        "question": "Are project files, logic changes, and engineering tools protected from unauthorized modification?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-015-01",
        "maps_to_control_ids": [
          "IEC-RDY-015"
        ],
        "preferred_evidence_types": [
          "Removable media procedure",
          "Scanning kiosk logs",
          "Exception records"
        ],
        "question": "Are removable media and portable devices controlled before connection to OT assets?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-015-02",
        "maps_to_control_ids": [
          "IEC-RDY-015"
        ],
        "preferred_evidence_types": [
          "Removable media procedure",
          "Scanning kiosk logs",
          "Exception records"
        ],
        "question": "Is malware scanning or staged transfer used for files entering production networks?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-016-01",
        "maps_to_control_ids": [
          "IEC-RDY-016"
        ],
        "preferred_evidence_types": [
          "Backup inventory",
          "Controller project backup",
          "Offline/immutable backup evidence"
        ],
        "question": "Are backups kept for controllers, HMIs, engineering projects, historians, and critical configuration files?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-016-02",
        "maps_to_control_ids": [
          "IEC-RDY-016"
        ],
        "preferred_evidence_types": [
          "Backup inventory",
          "Controller project backup",
          "Offline/immutable backup evidence"
        ],
        "question": "Are backup copies protected from unauthorized modification and ransomware impact?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-017-01",
        "maps_to_control_ids": [
          "IEC-RDY-017"
        ],
        "preferred_evidence_types": [
          "Restore test report",
          "Recovery runbook",
          "Lessons learned"
        ],
        "question": "Are restore tests performed for representative OT systems or configurations?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-017-02",
        "maps_to_control_ids": [
          "IEC-RDY-017"
        ],
        "preferred_evidence_types": [
          "Restore test report",
          "Recovery runbook",
          "Lessons learned"
        ],
        "question": "Are restore procedures understandable to operations and engineering staff during an incident?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-018-01",
        "maps_to_control_ids": [
          "IEC-RDY-018"
        ],
        "preferred_evidence_types": [
          "Patch review board notes",
          "Test results",
          "Patch exception register"
        ],
        "question": "Are OT patches assessed before deployment for compatibility and production impact?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-018-02",
        "maps_to_control_ids": [
          "IEC-RDY-018"
        ],
        "preferred_evidence_types": [
          "Patch review board notes",
          "Test results",
          "Patch exception register"
        ],
        "question": "Are delayed patches tracked with compensating controls and accountable risk acceptance?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-019-01",
        "maps_to_control_ids": [
          "IEC-RDY-019"
        ],
        "preferred_evidence_types": [
          "Vulnerability dashboard",
          "Triage notes",
          "Vendor advisories"
        ],
        "question": "Are vulnerabilities reviewed using asset criticality, exploitability, exposure, and operational impact?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-019-02",
        "maps_to_control_ids": [
          "IEC-RDY-019"
        ],
        "preferred_evidence_types": [
          "Vulnerability dashboard",
          "Triage notes",
          "Vendor advisories"
        ],
        "question": "Are false positives, unpatchable assets, and vendor constraints documented?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-020-01",
        "maps_to_control_ids": [
          "IEC-RDY-020"
        ],
        "preferred_evidence_types": [
          "Legacy asset list",
          "Compensating control register",
          "Segmentation evidence"
        ],
        "question": "Are unsupported or fragile OT systems identified?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-020-02",
        "maps_to_control_ids": [
          "IEC-RDY-020"
        ],
        "preferred_evidence_types": [
          "Legacy asset list",
          "Compensating control register",
          "Segmentation evidence"
        ],
        "question": "Are compensating controls such as isolation, monitoring, access restriction, or procedural checks documented?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-021-01",
        "maps_to_control_ids": [
          "IEC-RDY-021"
        ],
        "preferred_evidence_types": [
          "Baseline document",
          "Configuration export",
          "Deviation report"
        ],
        "question": "Are secure baseline settings defined for OT servers, workstations, and network devices?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-021-02",
        "maps_to_control_ids": [
          "IEC-RDY-021"
        ],
        "preferred_evidence_types": [
          "Baseline document",
          "Configuration export",
          "Deviation report"
        ],
        "question": "Are deviations reviewed and either corrected or accepted?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-022-01",
        "maps_to_control_ids": [
          "IEC-RDY-022"
        ],
        "preferred_evidence_types": [
          "OT monitoring inventory",
          "Sensor coverage map",
          "Alert samples"
        ],
        "question": "Is OT network traffic monitored passively or otherwise safely for the environment?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-022-02",
        "maps_to_control_ids": [
          "IEC-RDY-022"
        ],
        "preferred_evidence_types": [
          "OT monitoring inventory",
          "Sensor coverage map",
          "Alert samples"
        ],
        "question": "Are unknown assets, unexpected protocols, and cross-zone traffic reviewed?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-023-01",
        "maps_to_control_ids": [
          "IEC-RDY-023"
        ],
        "preferred_evidence_types": [
          "Log source list",
          "SIEM ingestion evidence",
          "Jump host logs"
        ],
        "question": "Are logs collected from domain services, remote access gateways, firewalls, jump hosts, and OT servers?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-023-02",
        "maps_to_control_ids": [
          "IEC-RDY-023"
        ],
        "preferred_evidence_types": [
          "Log source list",
          "SIEM ingestion evidence",
          "Jump host logs"
        ],
        "question": "Are logging gaps documented where devices cannot produce usable logs?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-024-01",
        "maps_to_control_ids": [
          "IEC-RDY-024"
        ],
        "preferred_evidence_types": [
          "Detection catalogue",
          "Use case test results",
          "Alert tuning notes"
        ],
        "question": "Are detection scenarios defined for unauthorized remote access, unexpected engineering changes, new devices,",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-024-02",
        "maps_to_control_ids": [
          "IEC-RDY-024"
        ],
        "preferred_evidence_types": [
          "Detection catalogue",
          "Use case test results",
          "Alert tuning notes"
        ],
        "question": "Are alerts tuned to avoid noise that operations will ignore?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-025-01",
        "maps_to_control_ids": [
          "IEC-RDY-025"
        ],
        "preferred_evidence_types": [
          "OT incident playbook",
          "Exercise report",
          "Call tree"
        ],
        "question": "Do incident playbooks account for safety, production continuity, manual operations, and vendor support?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-025-02",
        "maps_to_control_ids": [
          "IEC-RDY-025"
        ],
        "preferred_evidence_types": [
          "OT incident playbook",
          "Exercise report",
          "Call tree"
        ],
        "question": "Are OT incident roles and escalation paths tested with operations?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-026-01",
        "maps_to_control_ids": [
          "IEC-RDY-026"
        ],
        "preferred_evidence_types": [
          "Escalation matrix",
          "Safety contact list",
          "Incident command notes"
        ],
        "question": "Are safety, engineering, and operations contacts included in cyber escalation paths?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-026-02",
        "maps_to_control_ids": [
          "IEC-RDY-026"
        ],
        "preferred_evidence_types": [
          "Escalation matrix",
          "Safety contact list",
          "Incident command notes"
        ],
        "question": "Are shutdown, isolation, and recovery decisions tied to operational authority?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-027-01",
        "maps_to_control_ids": [
          "IEC-RDY-027"
        ],
        "preferred_evidence_types": [
          "Supplier clauses",
          "Procurement checklist",
          "Service agreement"
        ],
        "question": "Are supplier security responsibilities defined before procurement or service onboarding?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-027-02",
        "maps_to_control_ids": [
          "IEC-RDY-027"
        ],
        "preferred_evidence_types": [
          "Supplier clauses",
          "Procurement checklist",
          "Service agreement"
        ],
        "question": "Are notification, remote access, vulnerability disclosure, and support expectations included?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-028-01",
        "maps_to_control_ids": [
          "IEC-RDY-028"
        ],
        "preferred_evidence_types": [
          "Procurement requirement checklist",
          "Factory/site acceptance test notes",
          "Design review"
        ],
        "question": "Are security requirements included in OT procurement and design decisions?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-028-02",
        "maps_to_control_ids": [
          "IEC-RDY-028"
        ],
        "preferred_evidence_types": [
          "Procurement requirement checklist",
          "Factory/site acceptance test notes",
          "Design review"
        ],
        "question": "Is acceptance testing used to confirm security-relevant configuration before go-live?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-029-01",
        "maps_to_control_ids": [
          "IEC-RDY-029"
        ],
        "preferred_evidence_types": [
          "Automation change ticket",
          "Logic version history",
          "Engineering tool logs"
        ],
        "question": "Are automation changes reviewed, approved, tested, and traceable?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-029-02",
        "maps_to_control_ids": [
          "IEC-RDY-029"
        ],
        "preferred_evidence_types": [
          "Automation change ticket",
          "Logic version history",
          "Engineering tool logs"
        ],
        "question": "Can unauthorized or unexpected engineering changes be detected?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-030-01",
        "maps_to_control_ids": [
          "IEC-RDY-030"
        ],
        "preferred_evidence_types": [
          "Training material",
          "Attendance records",
          "Tabletop exercise"
        ],
        "question": "Do operations and engineering staff receive security guidance relevant to plant-floor work?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      },
      {
        "question_id": "Q-IEC-RDY-030-02",
        "maps_to_control_ids": [
          "IEC-RDY-030"
        ],
        "preferred_evidence_types": [
          "Training material",
          "Attendance records",
          "Tabletop exercise"
        ],
        "question": "Do IT and SOC staff understand OT constraints such as safety, uptime, vendor support, and fragile systems?",
        "answer_scale": "0,1,2,3,4,NA",
        "minimum_evidence_expected": "1",
        "gap_trigger": "score <= 2 or missing approved evidence"
      }
    ],
    "display_name": "IEC 62443 OT Security Readiness Workflow",
    "delivery_mode": "Audity-native readiness workflow plus tenant-provided licensed content import",
    "content_class": "audity_native_assessment_content",
    "content_status": "Supported through Audity OT readiness workflow. Official IEC/ISA standard text and requirement catalogues are not included.",
    "official_standard_text_included": false,
    "official_control_catalogue_included": false,
    "redistribution_note": "This pack uses original Audity wording only. It is not a copy, extract, paraphrase, translation, or reconstructed catalogue of proprietary standards content.",
    "licensed_content_import_supported": true
  }
] satisfies ReadinessFrameworkPack[];
