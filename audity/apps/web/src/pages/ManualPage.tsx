import { manualSections } from "../data/manualSections";


const featureManual = [
  "1. Global Search: use the top search field to find customers, assessments, findings, risks, reports and Workbench records.",
  "2. Command Palette: press Cmd/Ctrl+K to open quick actions and navigation.",
  "3. Guided Onboarding: use Dashboard onboarding and Workbench templates to guide first setup.",
  "4. Assessment Timeline: use Activity Log, Audit Center history and Workbench records to review assessment changes over time.",
  "5. Risk Review Workflow: manage risk draft, review, treatment, acceptance and closure in Findings & Risk.",
  "6. Evidence Request Workflow: create evidence requests in Audit Center or evidence_request records in Workbench with owner and due date.",
  "7. Customer Health Score: review risk, finding, evidence and connector indicators in Dashboard and Workbench analytics.",
  "8. Better Notifications: use the top notification bell for reminders, review work and system messages.",
  "9. Saved Views / Filters: save Workbench filters as reusable views.",
  "10. Bulk Actions: select Workbench records and use bulk review or bulk close.",
  "11. Connector Run History: review connector status and last result in Admin > Connector.",
  "12. Connector Field Validation: required connector fields are validated before save/test by backend and provider checks.",
  "13. Audit Trail Drawer: use Activity Log details for before/after change context.",
  "14. Report Templates: create assessment templates and report workflow gates in Workbench governance settings, then track report review in Audit Center.",
  "15. Role Presets: assign users to predefined roles in User Management.",
  "16. Customer Portal View: configure customer portal tasks and external visibility in Workbench.",
  "17. Framework Comparison: use framework_mapping records for crosswalk and comparison work.",
  "18. AI-Assisted Drafting: use ai_draft records to track generated draft text and review it before use.",
  "19. Data Quality Center: create and close data_quality records for missing owners, dates and evidence metadata.",
  "20. Keyboard / UX Polish: use Escape to close overlays where available and Cmd/Ctrl+K for navigation.",
  "21. Assessment Templates: create reusable assessment templates in Workbench automation.",
  "22. Recurring Assessments: create recurring assessment schedules in Workbench automation.",
  "23. Risk Acceptance Expiry: set risk acceptance expiry dates and track follow-up in Workbench.",
  "24. Evidence Expiry Tracking: use Audit Center evidence requests and policy records for expiring certificates or reports.",
  "25. Approval Gates: configure gates for risk, report, evidence and exception approval.",
  "26. Internal vs Customer Comments: use internal_comment and customer_comment Workbench records to separate visibility.",
  "27. Mentions: record @mentions in comments or Workbench descriptions so the responsible owner is visible.",
  "28. SLA Tracking: create SLA records for review and remediation targets.",
  "29. Risk Treatment Cost / Effort: store cost and effort in Workbench metadata or roadmap effort fields.",
  "30. Control Owner Matrix: manage control_owner records per domain, control and owner.",
  "31. Executive Dashboard: use Dashboard widgets and Workbench analytics for management summaries.",
  "32. Auditor Workbench: use Workbench filters for open reviews, evidence gaps and findings.",
  "33. Customer Comparison: compare Workbench analytics and dashboard customer health signals.",
  "34. Trend Analysis: use activity history, reports and Workbench analytics snapshots for trends.",
  "35. Maturity Heatmap: use Questions domain coverage and scores as maturity heatmap input.",
  "36. Dependency Mapping: create dependency records linking systems, vendors, processes and risks.",
  "37. Vendor Register: manage vendor records in Workbench.",
  "38. Asset Register: manage asset records in Workbench.",
  "39. Policy Register: manage policy records in Workbench.",
  "40. Exception Management: manage exception records with approval and expiry.",
  "41. Custom Fields: create custom fields in Workbench governance.",
  "42. Custom Status Workflows: create status workflows in Workbench governance.",
  "43. Advanced Permissions: manage roles in User Management and track granular needs in Workbench.",
  "44. Delegated Admins: configure delegated_admins integration setting.",
  "45. Read-only External Reviewer: create external_review records and assign Viewer role where needed.",
  "46. Export Center: create export_job records and use Reports/Evidence export actions.",
  "47. Evidence Package Export: track package exports as export_job records with manifest notes.",
  "48. Tamper Evidence View: use Activity Log hash verification.",
  "49. Data Retention Policies: create retention policies in Workbench governance.",
  "50. Legal Hold: create legal holds in Workbench governance.",
  "51. Webhook System: configure webhooks in Workbench governance and test delivery.",
  "52. Public API Tokens: create and revoke API tokens in Workbench governance.",
  "53. SCIM Provisioning: configure SCIM settings in Workbench governance.",
  "54. SSO Login: configure SSO settings in Workbench governance.",
  "55. MFA Enforcement: configure MFA enforcement and track MFA tasks.",
  "56. Session Management: use logout-all and active session analytics.",
  "57. Security Center: manage security_task records and audit hardening work.",
  "58. License / Usage Page: use Workbench analytics and license_note records.",
  "59. System Health Alerts: use health_alert records for server, backup and connector problems.",
  "60. Backup Restore Wizard: use Admin > Backup restore precheck and confirmation flow."
];

export function ManualPage() {
  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0">
        <div className="audity-page-header">
          <p className="audity-page-kicker">Documentation</p>
          <h1 className="audity-page-title">Manual</h1>
          <p className="audity-page-copy">A practical guide for new users, auditors and administrators. Screenshot placeholders use the required format so images can be added later.</p>
        </div>
        <div className="space-y-4">
          {manualSections.map((section) => (
            <section key={section.id} id={section.id} className="rounded-audity border border-audity-border bg-audity-panel p-4 scroll-mt-20">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-muted">({section.screenshot})</p>
              <div className="mt-3 space-y-2 text-sm leading-6 text-audity-secondary">
                {section.body.map((line) => <p key={line}>{line}</p>)}
              </div>
            </section>
          ))}
          <section id="feature-reference" className="rounded-audity border border-audity-border bg-audity-panel p-4 scroll-mt-20">
            <h2 className="text-lg font-semibold">Feature Reference 1-60</h2>
            <p className="mt-2 rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-muted">(Screenshot: Workbench feature coverage list with all 60 features)</p>
            <div className="mt-3 grid gap-2">
              {featureManual.map((item) => <p key={item} className="rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-sm text-audity-secondary">{item}</p>)}
            </div>
          </section>
        </div>
      </main>
      <aside className="hidden 2xl:block">
        <div className="sticky top-16 rounded-audity border border-audity-border bg-audity-panel p-3">
          <p className="text-xs font-semibold uppercase text-audity-muted">Contents</p>
          <nav className="mt-3 space-y-1">
            {manualSections.map((section) => (
              <a key={section.id} className="block rounded-audity px-2 py-1.5 text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text" href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
            <a className="block rounded-audity px-2 py-1.5 text-sm text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text" href="#feature-reference">Feature Reference</a>
          </nav>
        </div>
      </aside>
    </div>
  );
}
