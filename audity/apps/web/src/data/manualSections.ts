export const manualSections = [
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
