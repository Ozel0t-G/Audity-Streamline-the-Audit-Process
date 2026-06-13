const manualSections = [
  {
    id: "getting-started",
    title: "Getting Started",
    screenshot: "Screenshot: Audity dashboard with menu, search, notifications and workbench entry",
    body: [
      "Sign in with your Audity account, review the dashboard, then open My Customers to create or select a customer.",
      "Use User Settings to change your password, set up MFA and control tooltips. English is the default interface language.",
      "Use the global search or Cmd/Ctrl+K command palette to jump to customers, assessments, risks, findings, connectors, Workbench and this Manual."
    ]
  },
  {
    id: "customers-assessments",
    title: "Customers and Assessments",
    screenshot: "Screenshot: Customer detail page with scope, assessments and sharing",
    body: [
      "Create customers from My Customers. Add industry, regulatory context, critical systems and business criticality.",
      "Open a customer to select frameworks, define scope and create assessments. Assessments hold questions, findings, risks, evidence and reports.",
      "Share a customer with other users when collaboration is needed. Shared customers appear under Shared Customers."
    ]
  },
  {
    id: "guided-questions",
    title: "Guided Questions",
    screenshot: "Screenshot: Questions page with domains, controls, question form and suggestions",
    body: [
      "Open Questions from an assessment to answer framework controls. Select a domain, then a control, then score the maturity.",
      "Set answer state, evidence status and confidence. Notes should explain the score decision clearly.",
      "Low scores and missing evidence can automatically create findings and risks for review."
    ]
  },
  {
    id: "audit-center",
    title: "Audit Center",
    screenshot: "Screenshot: Audit Center with readiness score, tabs, control review and evidence mapping",
    body: [
      "Open Audit Center from an assessment to manage the audit scope, audit plan, program template, control review, evidence mapping and evidence requests.",
      "Use Controls & Evidence to review every control, set applicability, assign owners and reviewers, write maturity justification, map evidence and record control sign-off.",
      "Use Findings & Remediation for finding lifecycle, severity matrix, management response, remediation tracking and re-test status.",
      "Use Audit Work for interview notes and sampling. Use Report & Sign-off for report review workflow and auditor sign-off.",
      "Use Gaps & Pack to review the Statement of Applicability, generated Gap Register and download the Audit Evidence Pack manifest."
    ]
  },
  {
    id: "findings-risks",
    title: "Findings, Risks and Roadmap",
    screenshot: "Screenshot: Findings and Risk page with review status, risk register and roadmap",
    body: [
      "Findings move through suggested, in review, needs changes, confirmed, approved or dismissed.",
      "Risks support draft, open, in treatment, accepted and closed states. Add likelihood, impact, owner, treatment option, due date and treatment plan.",
      "Accepted risks require acceptance reason and expiry. Use roadmap generation to turn high and critical risks into remediation actions."
    ]
  },
  {
    id: "evidence-reports",
    title: "Evidence and Reports",
    screenshot: "Screenshot: Assessment assets page with evidence upload and report builder",
    body: [
      "Upload evidence files with tags, notes, versions and expiry dates. Expiring evidence should be tracked in Workbench as evidence requests.",
      "Use Report Builder to select sections, author data and export format. Report templates and approval gates are configured in Workbench.",
      "Evidence package exports and export tasks are tracked in the Workbench Export Center module."
    ]
  },
  {
    id: "dashboard",
    title: "Dashboard",
    screenshot: "Screenshot: Modular dashboard in edit mode with widget library",
    body: [
      "Click Edit Dashboard to add, remove or reorder widgets. Drag unused widgets from the library into the dashboard.",
      "Drop widgets into the library/remove area to remove them. The dashboard can be completely empty if that is what a user wants.",
      "Recommended widgets for managers are Executive Summary, Customer Health, Critical Risks, Evidence Gaps and Report Readiness."
    ]
  },
  {
    id: "workbench",
    title: "Workbench",
    screenshot: "Screenshot: Workbench modules, record list, saved views and admin configuration",
    body: [
      "Workbench is the tenant-wide admin place for evidence requests, vendor register, asset register, policy register, exceptions, dependencies and control owner matrix.",
      "Each workbench item has status, priority, owner, due date, visibility and metadata. Use bulk review and bulk close for multi-item updates.",
      "Saved Views store filters and columns for repeated work such as Open risks, Critical overdue or Evidence missing. Saved Views are global for the tenant and visible to every admin with Workbench access."
    ]
  },
  {
    id: "automation-governance",
    title: "Automation and Governance",
    screenshot: "Screenshot: Workbench Automation and Governance tab with templates, gates and integrations",
    body: [
      "Admins can create tenant-wide assessment templates, recurring assessments, approval gates, custom fields, custom status workflows, retention policies, legal holds and webhooks.",
      "SSO, SCIM, MFA enforcement, delegated admin mode and customer portal settings are configured in the integration settings area.",
      "Public API tokens are generated once. Store the token immediately; afterwards Audity only shows the prefix."
    ]
  },
  {
    id: "connectors",
    title: "Connectors",
    screenshot: "Screenshot: Connector gallery and connector settings overlay",
    body: [
      "Open Admin > Connector to configure Jira, Microsoft Teams, ServiceNow, SharePoint / OneDrive, Microsoft Entra ID, Power BI, Confluence and Slack.",
      "Each connector has connection settings, sync scope and initial sync range. Start initial sync once, then changes are synchronized automatically.",
      "Connector run history and errors appear in the connector status, Workbench analytics and notifications."
    ]
  },
  {
    id: "users-permissions",
    title: "Users, Roles and Permissions",
    screenshot: "Screenshot: User management page with collapsed role permission panels",
    body: [
      "Admins invite users, disable accounts and manage role permissions. Role panels are collapsed by default to save space.",
      "Use role presets such as Instance Admin, Tenant Admin, Assessment Manager, Auditor, Contributor, Reviewer and Viewer.",
      "Advanced permission and delegated admin tracking is handled in Workbench governance settings."
    ]
  },
  {
    id: "security-center",
    title: "Security Center",
    screenshot: "Screenshot: Workbench security task module and User Settings MFA area",
    body: [
      "Users enable MFA in User Settings. Admins can track MFA enforcement, sessions, API tokens, SSO and SCIM configuration in Workbench.",
      "Session management is available through logout-all and active session analytics. Security audit events are visible in Admin > Audit Log.",
      "Use Workbench security tasks to track hardening work such as enforcing MFA for privileged roles."
    ]
  },
  {
    id: "audit-logs",
    title: "Audit Trail and Tamper Evidence",
    screenshot: "Screenshot: Admin activity log with event detail and hash verification",
    body: [
      "Admin > Activity Log shows user activity with before/after values and hash-chain verification.",
      "Admin > Audit Log shows security-relevant activity such as login, MFA and password events.",
      "Use Verify Hash to confirm the activity log has not been modified."
    ]
  },
  {
    id: "analytics",
    title: "Analytics and Executive Views",
    screenshot: "Screenshot: Workbench analytics with usage, risks, findings and connector counters",
    body: [
      "Workbench analytics shows customer count, assessments, users, active sessions, evidence items, total risks, critical risks, open findings and connector errors.",
      "Use these numbers for executive dashboard work, customer comparison, trend analysis and system usage review.",
      "The Questions page provides maturity heatmap input through domain coverage and scores."
    ]
  },
  {
    id: "backup-restore",
    title: "Backup and Restore",
    screenshot: "Screenshot: Admin backup page with manual backup, schedule and restore precheck",
    body: [
      "Instance Admins can trigger manual backups, create download packages and configure automatic backup schedules.",
      "Before restore, run a restore precheck. A full restore requires explicit confirmation to prevent accidental data loss.",
      "System health alerts and backup failures should be tracked in Workbench health alerts."
    ]
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    screenshot: "Screenshot: Notification dropdown and Workbench health alerts",
    body: [
      "If a connector fails, open Admin > Connector and check Last result, then test the connection. Verify base URL, token and required fields.",
      "If users cannot access something, check User Management role permissions and whether the customer is shared with them.",
      "If reports look incomplete, check evidence gaps, report readiness, selected report blocks and approval gates."
    ]
  }
];

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
