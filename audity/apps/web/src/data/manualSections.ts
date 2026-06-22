export type ManualBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "steps"; intro?: string; items: string[] }
  | { kind: "fields"; intro?: string; items: Array<{ name: string; description: string }> }
  | { kind: "note"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "code"; text: string; language?: string };

export type ManualSection = {
  heading: string;
  blocks: ManualBlock[];
};

export type ManualArticle = {
  id: string;
  title: string;
  category: string;
  audience: "user" | "auditor" | "admin";
  keywords: string[];
  summary: string;
  screenshot?: string;
  sections: ManualSection[];
  related?: string[];
};

export type ManualCategory = {
  id: string;
  label: string;
  description: string;
};

export const manualCategories: ManualCategory[] = [
  { id: "start", label: "Getting Started", description: "First login, setup wizard, and orientation." },
  { id: "workspace", label: "Workspace", description: "Customers, assessments, dashboard, navigation." },
  { id: "audit", label: "Audit Work", description: "Guided Questions, Audit Center, Findings and Risk, Evidence and Reports." },
  { id: "personal", label: "Personal", description: "User Settings, password, MFA, language, theme." },
  { id: "admin", label: "Administration", description: "User management, frameworks, backups, connectors, updates." },
  { id: "reference", label: "Reference", description: "Keyboard shortcuts, Command Palette, glossary." }
];

const userMfaSection: ManualSection = {
  heading: "Set up multi factor authentication (MFA)",
  blocks: [
    { kind: "paragraph", text: "Audity supports time based one time password (TOTP) MFA using any standard authenticator app such as Authy, 1Password, Bitwarden, Google Authenticator, or Microsoft Authenticator." },
    {
      kind: "steps",
      intro: "Steps to enable MFA on your account:",
      items: [
        "Open User Settings from the top right user menu.",
        "Locate the Multi Factor Authentication section.",
        "Click Start MFA setup. A QR code and a secret string are displayed.",
        "Scan the QR code with your authenticator app, or paste the secret string manually.",
        "Enter the 6 digit code shown by the app into the verification field.",
        "Click Verify and enable.",
        "Audity will display a list of 10 recovery codes. Store them in a safe place (password manager or printed and locked). Each code works only once."
      ]
    },
    { kind: "note", text: "If you lose access to the authenticator app, you can sign in using one recovery code in place of the 6 digit code. After signing in, set up MFA again to refresh codes." },
    {
      kind: "steps",
      intro: "Regenerate recovery codes:",
      items: [
        "Open User Settings.",
        "In the MFA section, click Regenerate codes.",
        "Audity replaces all old recovery codes with 10 new codes. Old codes stop working immediately."
      ]
    }
  ]
};

export const manualArticles: ManualArticle[] = [
  {
    id: "first-login",
    title: "First login and initial setup",
    category: "start",
    audience: "admin",
    keywords: ["setup", "first start", "wizard", "initial admin", "smtp", "branding", "alpha disclaimer"],
    summary: "What happens the first time someone opens Audity in a fresh install: setup wizard, initial admin, optional SMTP and branding, alpha disclaimer.",
    screenshot: "Screenshot: First start setup wizard with admin account form",
    sections: [
      {
        heading: "Open Audity for the first time",
        blocks: [
          { kind: "paragraph", text: "When you visit Audity for the first time, the application checks whether a user already exists in the database. If none exists, it redirects you to the setup wizard." },
          {
            kind: "steps",
            intro: "Use the wizard to create the first Instance Admin:",
            items: [
              "Open the application URL in a modern browser (Chrome, Firefox, Safari, or Edge).",
              "When the setup wizard appears, enter Admin name, Admin email, and a strong Admin password.",
              "Audity shows a password strength indicator. Aim for at least Good (length, mixed case, digits, symbols).",
              "Click Create admin and continue.",
              "Optional: enter SMTP host, user, password, and sender. These power outgoing email such as report deliveries and notifications. You can skip this and configure it later under Admin Email Settings.",
              "Optional: edit the Report Header and Report Footer. These appear in generated PDF reports.",
              "Click Save and continue, or Skip optional setup."
            ]
          },
          { kind: "note", text: "After setup, Audity routes you to the alpha disclaimer. Accept the disclaimer to enter the application." }
        ]
      },
      {
        heading: "Accept the alpha disclaimer",
        blocks: [
          { kind: "paragraph", text: "Audity is in an alpha stage. The disclaimer explains the limitations and asks for confirmation that you understand the state of the product. You must accept this once per user account before you can use the workspace." }
        ]
      }
    ],
    related: ["user-settings", "smtp-settings", "branding"]
  },
  {
    id: "navigation",
    title: "Navigation, top bar, and command palette",
    category: "start",
    audience: "user",
    keywords: ["topbar", "sidebar", "navigation", "command palette", "cmd k", "ctrl k", "search", "notifications", "help drawer", "skip link", "mobile nav"],
    summary: "How to move around the application. Top bar, sidebar, mobile nav, global search, command palette, help drawer, and notifications.",
    sections: [
      {
        heading: "Top bar",
        blocks: [
          { kind: "paragraph", text: "The top bar stays visible while you scroll. It contains the brand mark, optional mobile menu toggle, the global search field, notifications, the help icon, and the user menu." },
          {
            kind: "fields",
            intro: "Elements from left to right:",
            items: [
              { name: "Brand mark", description: "Click the Audity logo to return to the dashboard from any page." },
              { name: "Mobile menu toggle", description: "On narrow screens, click the menu icon to open the side navigation drawer." },
              { name: "Customer pill", description: "When a customer is in context, a pill shows the short customer name. Hover to see the full name." },
              { name: "Global search", description: "Type at least two characters. Audity shows top matches across customers, assessments, findings, risks, reports, evidence, and policies." },
              { name: "Notifications bell", description: "Click to open the notifications drawer. A red dot marks unread notifications. Click Mark all read to clear the dot." },
              { name: "Help icon", description: "Opens the Help Drawer with a searchable summary of this manual without leaving your current page." },
              { name: "User menu", description: "Opens User Settings, switches to the admin panel if you have admin role, or signs you out." }
            ]
          }
        ]
      },
      {
        heading: "Sidebar",
        blocks: [
          { kind: "paragraph", text: "The sidebar is fixed on the left. It groups navigation into Workspace, Customer context, and Settings. Items under Customer context (Questions, Audit Center, Findings and Risk, Evidence and Reports) become active only after you select or create an assessment for a customer." },
          { kind: "note", text: "If the customer context items are greyed out, open a customer, then open or create an assessment. The sidebar updates automatically." }
        ]
      },
      {
        heading: "Command Palette",
        blocks: [
          { kind: "paragraph", text: "Press Cmd+K on macOS or Ctrl+K on Windows or Linux to open the Command Palette." },
          {
            kind: "steps",
            intro: "Use the Command Palette to jump anywhere:",
            items: [
              "Open with Cmd+K or Ctrl+K.",
              "Type the name of a customer, assessment, finding, risk, report, control code, or page.",
              "Use the up and down arrow keys to navigate results.",
              "Press Enter to open the highlighted result.",
              "Press Escape to close without changing pages."
            ]
          }
        ]
      },
      {
        heading: "Help Drawer",
        blocks: [
          { kind: "paragraph", text: "The Help icon (?) opens a slide in drawer with a searchable summary of the manual. The drawer overlays the page so you can read a how to without losing your work." }
        ]
      }
    ],
    related: ["manual-page", "dashboard"]
  },
  {
    id: "dashboard",
    title: "Dashboard widgets and edit mode",
    category: "workspace",
    audience: "user",
    keywords: ["dashboard", "widgets", "edit mode", "drag and drop", "summary", "open tasks", "critical risks", "evidence gaps", "onboarding tips"],
    summary: "How to read the dashboard widgets and customize the layout in edit mode.",
    sections: [
      {
        heading: "Default widgets",
        blocks: [
          { kind: "paragraph", text: "Each user has their own dashboard layout stored locally. The default layout shows Summary, Open Tasks, Customers, Critical Risks, and Evidence Gaps." },
          { kind: "paragraph", text: "Onboarding Tips appears as a banner when no customers exist. Dismiss it once and it stays hidden." }
        ]
      },
      {
        heading: "Customize the layout",
        blocks: [
          {
            kind: "steps",
            intro: "Add or remove widgets:",
            items: [
              "Open Dashboard.",
              "Click Edit dashboard in the page header.",
              "The widget library appears. Click Add on a widget card to add it to the layout, or click Remove on a placed widget to remove it.",
              "Drag a placed widget to reorder it. The layout supports keyboard navigation as well (Tab to the widget, press Space to grab, arrow keys to move, Space to drop).",
              "Click Done editing to leave edit mode. The layout is saved in your browser."
            ]
          },
          { kind: "note", text: "Widgets marked Coming soon describe planned content but currently render a placeholder. Implemented widgets show live data." }
        ]
      }
    ],
    related: ["navigation", "workbench"]
  },
  {
    id: "customers",
    title: "Create and manage customers",
    category: "workspace",
    audience: "user",
    keywords: ["customers", "create customer", "csv import", "bulk import", "share customer", "shared customers", "owned customers", "criticality", "industry"],
    summary: "How to create customers, import a list via CSV, share customers with colleagues, and manage customer metadata.",
    sections: [
      {
        heading: "Create a single customer",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open My Customers from the sidebar (under Workspace).",
              "Fill in the Create customer form on the right side.",
              "Required: Name. Optional: Industry, Regulatory context, Critical systems, Business criticality.",
              "Click Create. The customer appears in the table on the left.",
              "Click the customer name to open the customer detail page."
            ]
          }
        ]
      },
      {
        heading: "Bulk import via CSV",
        blocks: [
          { kind: "paragraph", text: "Use bulk import when you have many customers to onboard from another system." },
          {
            kind: "steps",
            items: [
              "Open My Customers.",
              "Click Import CSV in the page header.",
              "Select a CSV file. The first row must be a header row with column names.",
              "Required column: name. Optional columns: industry, regulatoryContext (or regulatory_context), businessCriticality (or business_criticality), status, criticalSystems (or critical_systems, separated by semicolons or pipes).",
              "Audity imports each row, creating one customer per row. Rows without a name are skipped.",
              "If some rows fail (for example duplicate names), Audity shows the affected names so you can fix them and re import."
            ]
          },
          { kind: "code", language: "csv", text: "name,industry,regulatoryContext,businessCriticality,status,criticalSystems\nAcme Manufacturing,Manufacturing,IEC 62443,High,active,SCADA;PLC;HMI\nNorth Star Bank,Finance,ISO 27001,Critical,active,Core Banking;Payment Gateway" }
        ]
      },
      {
        heading: "Share a customer",
        blocks: [
          { kind: "paragraph", text: "Sharing lets a colleague see and work on the customer with their own permissions. Shared customers appear in the sidebar under Shared Customers." },
          {
            kind: "steps",
            items: [
              "Open the customer detail page.",
              "Locate the Share section.",
              "Search for the user by name or email. Only active users with the right permission can be selected.",
              "Optionally enter a short message that becomes part of the share notification.",
              "Click Share. The user is notified and the customer appears in their Shared Customers list.",
              "Revoke a share by clicking Revoke next to the user in the Shared with list."
            ]
          }
        ]
      },
      {
        heading: "My Customers vs Shared Customers vs Customers",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "My Customers", description: "Customers you created. You are the owner." },
              { name: "Shared Customers", description: "Customers others created and shared with you." },
              { name: "Customers", description: "All customers visible to you. Available when your role includes broader permissions." }
            ]
          }
        ]
      }
    ],
    related: ["assessments", "navigation"]
  },
  {
    id: "assessments",
    title: "Create and run assessments",
    category: "workspace",
    audience: "user",
    keywords: ["assessments", "framework", "scope", "create assessment", "status", "target date", "progress"],
    summary: "How to create assessments under a customer, select frameworks, define scope, and track progress.",
    sections: [
      {
        heading: "Create an assessment",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open a customer detail page.",
              "Scroll to the Assessments section.",
              "Click New assessment.",
              "Choose a Framework. The dropdown shows all frameworks loaded into the catalog.",
              "Optionally set Target date and Type. Type defaults to the framework family.",
              "Click Create. Audity adds the assessment and brings you to the workflow view."
            ]
          }
        ]
      },
      {
        heading: "Open and continue an assessment",
        blocks: [
          { kind: "paragraph", text: "Use the sidebar links once an assessment is in context: Questions, Audit Center, Findings and Risk, Evidence and Reports. The sidebar shows the active customer and assessment as a header above these items." }
        ]
      }
    ],
    related: ["customers", "guided-questions", "audit-center"]
  },
  {
    id: "guided-questions",
    title: "Guided Questions",
    category: "audit",
    audience: "auditor",
    keywords: ["questions", "controls", "score", "maturity", "evidence", "confidence", "suggestions", "tree drawer", "save and next", "search controls"],
    summary: "How to answer framework questions efficiently using the new two pane layout with a tree drawer, search, and per control suggestions.",
    screenshot: "Screenshot: Guided Questions with tree drawer on the left, question form in the center, suggestions panel on the right",
    sections: [
      {
        heading: "Layout overview",
        blocks: [
          { kind: "paragraph", text: "The Guided Questions page is a two pane layout. The left pane is a collapsible drawer that lists all Domains and their Controls. The right side shows the current question, the answer form, and a Suggestions panel." },
          { kind: "paragraph", text: "The top bar shows the framework name, the answered count vs total, follow up count, gap count, low confidence count, and overall coverage percentage." }
        ]
      },
      {
        heading: "Navigate domains and controls",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click a Domain row in the left drawer to expand its Controls.",
              "Click a Control row to load it in the main area.",
              "Use the search field at the top of the drawer to filter by code, title, or category.",
              "Status icons next to each control show progress: green check means answered, orange dot means evidence gap, no icon means not started.",
              "Use the chevron in the drawer header to collapse the drawer when you want full focus mode."
            ]
          }
        ]
      },
      {
        heading: "Read the description",
        blocks: [
          { kind: "paragraph", text: "Each question shows the control code, the full question text, the control title (when different), the control description (when different from title), and a Category context block that explains the category of the control. The category context comes directly from the framework YAML." }
        ]
      },
      {
        heading: "Evidence examples and framework mappings",
        blocks: [
          { kind: "paragraph", text: "Below the question Audity lists Evidence examples (typical artifacts) and Framework mappings (other frameworks that contain a corresponding control). Use these as inline reference." }
        ]
      },
      {
        heading: "Answer a control",
        blocks: [
          {
            kind: "fields",
            intro: "The answer form has four select fields and a notes textarea:",
            items: [
              { name: "Score", description: "0 None, 1 Initial, 2 Partial, 3 Defined, 4 Managed, 5 Optimized. This is the maturity score." },
              { name: "Answer State", description: "answered, needs follow up, not applicable, unknown. Use needs follow up while waiting for input." },
              { name: "Evidence Status", description: "not requested, requested, received, validated, missing. Track the lifecycle of the supporting evidence." },
              { name: "Confidence", description: "low, medium, high. Mark low when you are not yet sure about the score." },
              { name: "Notes", description: "Explain the score decision. List evidence reviewed. Link follow up tasks. This text appears in reports." }
            ]
          },
          {
            kind: "steps",
            intro: "Save the answer:",
            items: [
              "Click Save answer to save the current control and stay on the same control.",
              "Click Save and next to save and jump to the next control in order. This is the fastest way to work through a framework."
            ]
          }
        ]
      },
      {
        heading: "Suggestions panel",
        blocks: [
          { kind: "paragraph", text: "The right hand panel shows Suggestions for the current control. These are loaded directly from the framework YAML and describe concrete actions that improve readiness for the control. Tooltips and contextual help on form fields are still available, but evidence, mapping, and review tabs from the previous version are now inlined under the question." }
        ]
      },
      {
        heading: "Keyboard shortcuts",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Tab", description: "Move focus through the form fields." },
              { name: "Shift+Tab", description: "Move focus backwards." },
              { name: "Enter (in a select)", description: "Open the select dropdown." },
              { name: "Cmd+K or Ctrl+K", description: "Open the Command Palette to jump to another control by code." }
            ]
          }
        ]
      }
    ],
    related: ["audit-center", "findings-risk", "evidence-reports"]
  },
  {
    id: "audit-center",
    title: "Audit Center: scope, plan, controls, findings, report",
    category: "audit",
    audience: "auditor",
    keywords: ["audit center", "scope", "plan", "controls", "evidence", "findings", "remediation", "report", "sign off", "gaps", "tabs", "workflow stepper"],
    summary: "Audit Center bundles the seven step audit workflow: Overview, Scope and Plan, Controls and Evidence, Findings and Remediation, Audit Work, Report and Sign off, Gaps and Pack.",
    sections: [
      {
        heading: "Workflow stepper",
        blocks: [
          { kind: "paragraph", text: "The top of the Audit Center shows a horizontal stepper of all seven steps. Each step is marked done, current, todo, or blocked. Click a step in the stepper or a tab below it to jump to that section. The active tab is also reflected in the URL (?tab=slug), so you can bookmark or share a direct link." }
        ]
      },
      {
        heading: "Step 1: Overview",
        blocks: [
          { kind: "paragraph", text: "Overview shows readiness metrics: coverage percentage, answered controls, evidence completeness, finding counts by severity, risk register summary, and roadmap status. Use it as the situation report for management." }
        ]
      },
      {
        heading: "Step 2: Scope and Plan",
        blocks: [
          { kind: "paragraph", text: "Define what is in scope and the audit plan. Add scope items (systems, processes, suppliers, data types, locations, regulations). Document the plan with phases, dates, and responsible owners." }
        ]
      },
      {
        heading: "Step 3: Controls and Evidence",
        blocks: [
          { kind: "paragraph", text: "Map evidence items to controls. Request missing evidence from owners. Mark evidence as received or validated. The list integrates with Questions answers so progress flows back to the dashboard." }
        ]
      },
      {
        heading: "Step 4: Findings and Remediation",
        blocks: [
          { kind: "paragraph", text: "Create findings from low scores, missing evidence, or auditor observations. Each finding has severity, status, owner, due date, remediation plan, and links to risks. Confirm or reject suggested findings. Approve findings before they become public." }
        ]
      },
      {
        heading: "Step 5: Audit Work",
        blocks: [
          { kind: "paragraph", text: "Record audit activities, interviews, sampling, and walkthroughs. Attach notes and evidence. Track tester sign offs and reviewer approvals." }
        ]
      },
      {
        heading: "Step 6: Report and Sign off",
        blocks: [
          { kind: "paragraph", text: "Generate the audit report in PDF and HTML. Choose template, branding, sections to include, and signatories. Track sign off by stakeholders." }
        ]
      },
      {
        heading: "Step 7: Gaps and Pack",
        blocks: [
          { kind: "paragraph", text: "Bundle the deliverables: report, evidence pack, finding register, risk register, roadmap. Export as an encrypted package for delivery to the customer or auditor." }
        ]
      }
    ],
    related: ["guided-questions", "findings-risk", "evidence-reports"]
  },
  {
    id: "findings-risk",
    title: "Findings and Risk (Workflow page)",
    category: "audit",
    audience: "auditor",
    keywords: ["findings", "risk register", "risk matrix", "risk acceptance", "roadmap", "treatment", "csv import", "csv export", "review notes", "drag and drop"],
    summary: "Manage findings, risks, treatments, and the remediation roadmap from one workflow page.",
    sections: [
      {
        heading: "Findings",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open Findings and Risk from the sidebar after selecting an assessment.",
              "Switch to the Findings tab.",
              "Confirm or reject suggested findings created from low scores or evidence gaps.",
              "Click Add finding to create a manual finding. Set severity, status, owner, due date, and remediation plan.",
              "Use the Approve button on a finding to mark it as approved (requires the finding.approve permission)."
            ]
          }
        ]
      },
      {
        heading: "Risk register",
        blocks: [
          {
            kind: "fields",
            intro: "Each risk has these fields:",
            items: [
              { name: "Title", description: "Short risk description." },
              { name: "Description", description: "Longer narrative of the threat and impact scenario." },
              { name: "Likelihood", description: "1 to 5 (rare to almost certain)." },
              { name: "Impact", description: "1 to 5 (negligible to catastrophic)." },
              { name: "Treatment", description: "Mitigate, Accept, Transfer, Avoid." },
              { name: "Owner", description: "Person or team responsible for the treatment." },
              { name: "Due date", description: "Target date for the treatment action." },
              { name: "Treatment plan", description: "Concrete steps planned." },
              { name: "Residual risk", description: "Score after treatment is in place." },
              { name: "Acceptance expiry", description: "When accepted risk needs to be reviewed again." }
            ]
          },
          {
            kind: "steps",
            intro: "Import risks from CSV:",
            items: [
              "Click CSV template to download an empty template with the expected columns.",
              "Fill the template, save as UTF-8 CSV.",
              "Click Import CSV and select the file. Audity parses and adds the risks."
            ]
          }
        ]
      },
      {
        heading: "Risk matrix",
        blocks: [
          { kind: "paragraph", text: "The 5x5 matrix at the top of the Risk register shows the count per cell. Click a cell to filter the table to that combination. Click Clear filter to show all risks again." }
        ]
      },
      {
        heading: "Roadmap",
        blocks: [
          { kind: "paragraph", text: "Roadmap groups planned actions into four phases (Immediate, Short term, Medium term, Long term). Drag and drop a card between columns to change the phase. Keyboard alternative: Tab to a card, press Space to grab, arrow keys to move, Space to drop." },
          { kind: "paragraph", text: "Auto generate creates roadmap actions from high and critical risks. Generate from risk creates a single roadmap action for the selected risk." }
        ]
      }
    ],
    related: ["audit-center", "evidence-reports"]
  },
  {
    id: "evidence-reports",
    title: "Evidence and Reports",
    category: "audit",
    audience: "auditor",
    keywords: ["evidence", "evidence requests", "evidence pack", "reports", "pdf", "html", "report templates", "branding", "watermark"],
    summary: "Upload evidence, request evidence from owners, and generate PDF and HTML reports.",
    sections: [
      {
        heading: "Upload evidence",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open Evidence and Reports from the sidebar.",
              "Click Upload evidence.",
              "Select one or more files (PDF, images, text, common office formats).",
              "Add a description and select the related controls.",
              "Click Save. Audity uploads the files into encrypted object storage and links them to the controls."
            ]
          }
        ]
      },
      {
        heading: "Request evidence",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click Request evidence.",
              "Choose the control and a target owner (must be a user with access to the customer).",
              "Set a due date and an optional message.",
              "Click Send. The owner receives a notification and can upload the requested evidence."
            ]
          }
        ]
      },
      {
        heading: "Generate reports",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click Generate report.",
              "Choose a template (Standard, Executive, Technical, Custom).",
              "Choose sections to include (Executive Summary, Domain heatmap, Findings detail, Risk register, Roadmap, Evidence appendix).",
              "Choose output format (PDF or HTML).",
              "Click Generate. The report is queued and shows in the reports list once ready. PDF reports include the configured Branding and Watermark."
            ]
          }
        ]
      }
    ],
    related: ["audit-center", "branding"]
  },
  {
    id: "workbench",
    title: "Workbench",
    category: "workspace",
    audience: "user",
    keywords: ["workbench", "records", "filters", "saved views", "automation", "governance", "analytics", "coverage", "bulk actions", "undo"],
    summary: "Workbench is the back office where automation, governance, analytics, and feature coverage records live. Auditors use it for sampling and bulk actions.",
    sections: [
      {
        heading: "Tabs",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Workflows and Registers", description: "All record kinds used in operational workflows (evidence requests, findings, risks, exceptions, policies, vendors, assets)." },
              { name: "Automation and Governance", description: "Recurring assessments, templates, status workflows, custom fields, retention policies, webhooks, SSO/SCIM settings." },
              { name: "Analytics", description: "Trend metrics, customer health, control coverage breakdowns." },
              { name: "Feature Coverage", description: "Live mapping of advanced features to record kinds. Useful when verifying whether a feature is implemented." }
            ]
          }
        ]
      },
      {
        heading: "Use bulk actions safely",
        blocks: [
          {
            kind: "steps",
            items: [
              "Filter records to the set you want to change.",
              "Select rows using the checkbox column.",
              "Choose a bulk action such as Bulk review or Bulk close.",
              "Confirm the action in the dialog.",
              "After the action runs, an Undo button appears in the success toast for 8 seconds. Click Undo to revert all records to their previous status."
            ]
          },
          { kind: "warning", text: "Closing or rejecting records by mistake is reversible only via the Undo button shown in the toast. After 8 seconds, you have to manually revert each record." }
        ]
      }
    ],
    related: ["dashboard", "audit-center"]
  },
  {
    id: "user-settings",
    title: "User Settings: profile, password, MFA, interface",
    category: "personal",
    audience: "user",
    keywords: ["user settings", "profile", "password", "change password", "mfa", "totp", "recovery codes", "language", "theme", "density", "tooltips", "notifications"],
    summary: "All personal settings live in one page: profile, password, MFA, language, theme, density, default view, and tooltip behavior.",
    sections: [
      {
        heading: "Open User Settings",
        blocks: [
          { kind: "paragraph", text: "Click the user avatar at the top right and choose User Settings. Or use the sidebar under Settings." }
        ]
      },
      {
        heading: "Change your password",
        blocks: [
          {
            kind: "steps",
            items: [
              "Locate the Change Password section.",
              "Enter Current Password.",
              "Enter New Password. A strength indicator shows whether the password is weak, okay, good, or strong.",
              "Enter Confirm Password (must match new password).",
              "Click Save."
            ]
          },
          { kind: "note", text: "Use a unique password stored in a password manager. The minimum length is 8 characters but at least 12 with mixed case, digits, and symbols is recommended." }
        ]
      },
      userMfaSection,
      {
        heading: "Interface preferences",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Language", description: "English (default) or Deutsch. The setting also affects date format." },
              { name: "Theme", description: "System (follow the OS), Light, or Dark." },
              { name: "Density", description: "Comfortable or Compact. Compact reduces padding in tables and forms." },
              { name: "Default view", description: "Page Audity opens on after login (Dashboard, My Customers, Workbench)." },
              { name: "Tooltips", description: "Turn on or off the hover tooltips that explain buttons and fields." },
              { name: "Notifications", description: "Toggle in app notification bell updates." }
            ]
          },
          { kind: "note", text: "Settings save to your account in the database, so they apply across all your devices after the next login. Some preferences also keep a local copy for fast load." }
        ]
      }
    ],
    related: ["navigation"]
  },
  {
    id: "manual-page",
    title: "Manual and Help Drawer",
    category: "reference",
    audience: "user",
    keywords: ["manual", "documentation", "help drawer", "search", "wiki", "keywords"],
    summary: "Two ways to read documentation in Audity: the full Manual page and the side Help Drawer with search.",
    sections: [
      {
        heading: "Full manual",
        blocks: [
          { kind: "paragraph", text: "Open Manual from the sidebar to see all articles organized by category. Each article shows audience, keywords (clickable to filter), and a structured body with how to steps." }
        ]
      },
      {
        heading: "Help drawer",
        blocks: [
          { kind: "paragraph", text: "Click the help icon (?) in the top bar to open the drawer. It searches across article titles, summaries, and keywords. Useful when you need a quick answer without leaving the current page." }
        ]
      }
    ]
  },
  {
    id: "notifications",
    title: "Notifications",
    category: "workspace",
    audience: "user",
    keywords: ["notifications", "bell", "reminders", "review", "mark read", "stream", "sse"],
    summary: "Where in app notifications come from and how to manage them.",
    sections: [
      {
        heading: "How notifications work",
        blocks: [
          { kind: "paragraph", text: "Audity opens a long lived server sent events stream from your browser to /api/notifications/stream. The stream sends a small event when something changes that concerns you. The browser then fetches the new list. If the stream is unavailable, Audity falls back to polling every 30 seconds while the tab is visible." }
        ]
      },
      {
        heading: "Manage notifications",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click the bell icon at the top right.",
              "The drawer lists unread notifications first, then read.",
              "Click a notification to open the related page.",
              "Click Mark all read to clear the unread badge."
            ]
          }
        ]
      }
    ]
  },
  {
    id: "admin-users",
    title: "Admin: User Management",
    category: "admin",
    audience: "admin",
    keywords: ["admin", "users", "invite", "disable", "role", "permissions", "role presets", "instance admin", "tenant admin", "viewer"],
    summary: "Invite users, change roles, disable accounts, manage roles and permissions.",
    sections: [
      {
        heading: "Open User Management",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the user menu at the top right and click Admin Panel (visible only to admin roles).",
              "In the admin sidebar click User Management.",
              "The table lists all users with name, email, role, and status."
            ]
          }
        ]
      },
      {
        heading: "Invite a user",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click Invite user.",
              "Enter Email, Name, Role (Viewer, Editor, Auditor, Tenant Admin, Instance Admin), and a temporary Password.",
              "Click Invite. The user can now sign in with the temporary password and must change it on first login if your policy requires it."
            ]
          }
        ]
      },
      {
        heading: "Change role or status",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click the row of the target user.",
              "Use the Role dropdown to change the role.",
              "Click Disable to set status to disabled. Disabled users cannot sign in.",
              "Click Enable to reactivate. The user can sign in again with their previous password."
            ]
          },
          { kind: "warning", text: "Audity will not let you disable or demote the last active Instance Admin. Create another Instance Admin first." }
        ]
      },
      {
        heading: "Manage role permissions",
        blocks: [
          { kind: "paragraph", text: "Expand a role row to see its permissions. Click a permission to toggle. Save the change. Instance Admin is locked at full permissions." }
        ]
      }
    ]
  },
  {
    id: "admin-frameworks",
    title: "Admin: Framework Library",
    category: "admin",
    audience: "admin",
    keywords: ["frameworks", "library", "yaml", "sync", "import", "license", "iso 27001", "iec 62443", "nist csf", "readiness workflow", "yaml managed"],
    summary: "How frameworks are loaded into Audity and how to sync changes from YAML files into the database.",
    sections: [
      {
        heading: "Catalog folder structure",
        blocks: [
          { kind: "paragraph", text: "Frameworks are stored as YAML files under frameworks/catalog. There are two scan locations:" },
          {
            kind: "fields",
            items: [
              { name: "audity-builtin", description: "Audity native frameworks shipped with the product. Currently contains NIST CSF 2.0 (official, public domain content), ISO 27001 Annex A Readiness Workflow (Audity native wording), and IEC 62443-3-3 Readiness Workflow (Audity native wording)." },
              { name: "yaml-managed", description: "Tenant provided licensed content. Customers who hold a license to ISO 27001 or IEC 62443 can drop their licensed content here to enrich the readiness workflows. Files are loaded automatically on next sync." }
            ]
          }
        ]
      },
      {
        heading: "Sync YAML changes",
        blocks: [
          {
            kind: "steps",
            items: [
              "After editing a YAML file (locally or via deployment), open the Admin Framework Library.",
              "Click Sync YAML. Audity scans both folders and upserts each framework. Existing frameworks are updated, new ones are inserted.",
              "The result panel lists each scanned file with control counts and any errors."
            ]
          },
          { kind: "code", language: "bash", text: "# trigger the same sync from a shell\ncurl -X POST -H \"Authorization: Bearer $TOKEN\" -H \"X-CSRF-Token: $CSRF\" http://localhost:3000/api/admin/frameworks/sync-yaml" }
        ]
      },
      {
        heading: "Suggestions in YAML",
        blocks: [
          { kind: "paragraph", text: "Each control can carry a suggestions array. The Guided Questions page reads these and renders them in the Suggestions panel. Use them to give auditors specific actionable advice per control." },
          { kind: "code", language: "yaml", text: "- id: GV.OC-01\n  title: ...\n  description: ...\n  suggestions:\n    - Assign an accountable owner for this outcome and record their authority in writing.\n    - Define and document the process that achieves this outcome.\n    - Measure and review this outcome on a defined cadence." }
        ]
      }
    ]
  },
  {
    id: "admin-activity",
    title: "Admin: Activity Log",
    category: "admin",
    audience: "admin",
    keywords: ["activity log", "audit trail", "user actions", "filters", "export", "csv", "tamper evidence", "hash chain"],
    summary: "Browse and verify the workflow activity log. Includes filtering and tamper evident hash chain verification.",
    sections: [
      {
        heading: "Browse",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open Admin Panel and click Activity Log.",
              "Use the filters above the table: User, Assessment, Action, Entity type, Date range.",
              "Click Apply to filter. Click Clear to reset.",
              "Click a row to expand the before and after JSON details."
            ]
          }
        ]
      },
      {
        heading: "Verify hash chain",
        blocks: [
          { kind: "paragraph", text: "Audity stores each activity event with a hash of the previous event. To verify that the chain has not been tampered with:" },
          {
            kind: "steps",
            items: [
              "Click Verify hash. Audity walks the chain from the start.",
              "If valid, the result panel shows Valid with the total number of events checked.",
              "If invalid, the result panel shows the position where the chain broke."
            ]
          }
        ]
      },
      {
        heading: "Export",
        blocks: [
          { kind: "paragraph", text: "Click Export CSV to download the currently filtered set as CSV." }
        ]
      }
    ]
  },
  {
    id: "admin-audit",
    title: "Admin: Audit Log",
    category: "admin",
    audience: "admin",
    keywords: ["audit log", "auth events", "login", "logout", "mfa", "permission denied", "session revoked"],
    summary: "Security relevant events (logins, MFA changes, password changes, permission denials). Separate from the workflow Activity Log.",
    sections: [
      {
        heading: "What is recorded",
        blocks: [
          { kind: "paragraph", text: "Audit Log records authentication and security events: login success, login failed, MFA enabled, MFA disabled, recovery codes regenerated, password changed, session revoked, role changed." }
        ]
      },
      {
        heading: "Filter and export",
        blocks: [
          { kind: "paragraph", text: "Use the Action and Date filters at the top. Click Export CSV to download the filtered set." }
        ]
      }
    ]
  },
  {
    id: "admin-system",
    title: "Admin: System Monitor",
    category: "admin",
    audience: "admin",
    keywords: ["system monitor", "cpu", "memory", "storage", "uptime", "updates", "version", "hostname", "ip"],
    summary: "Live system metrics, system settings, and updates.",
    sections: [
      {
        heading: "Live metrics",
        blocks: [
          { kind: "paragraph", text: "The Snapshot card shows current CPU, memory, storage, server IP, hostname, and uptime. The Timeline shows the history over 6 hours, 24 hours, 1 week, or 1 month. Issues are listed when thresholds are exceeded." }
        ]
      },
      {
        heading: "System settings",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Session idle timeout (minutes)", description: "How long the app waits without user activity before logging the user out. Default 30 minutes. Range 1 to 180." }
            ]
          }
        ]
      },
      {
        heading: "Updates",
        blocks: [
          {
            kind: "steps",
            items: [
              "Click Check for updates. Audity queries the configured update channel.",
              "If an update is available, the latest version is shown.",
              "Instance Admin can click Run update. A background job pulls the new images and restarts the services. Progress is shown in real time via polling."
            ]
          },
          { kind: "warning", text: "Updates restart api, worker, and web services. Active sessions will need to refresh the page after the update completes." }
        ]
      }
    ]
  },
  {
    id: "admin-connectors",
    title: "Admin: Connectors",
    category: "admin",
    audience: "admin",
    keywords: ["connectors", "jira", "confluence", "slack", "teams", "sharepoint", "entra", "power bi", "servicenow", "integration", "test connection"],
    summary: "Configure outbound integrations with external systems (Jira, Confluence, ServiceNow, SharePoint, OneDrive, Entra ID, Power BI, Teams, Slack).",
    sections: [
      {
        heading: "Configure a connector",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open Admin Panel and click Connector.",
              "Click the card of the integration you want to configure.",
              "Fill in the required fields. Each connector lists its required and optional fields with placeholders.",
              "Click Test to verify the connection. Audity attempts to authenticate and reports the result.",
              "Click Save. The connector becomes active for related workflows (such as creating Jira issues from findings)."
            ]
          }
        ]
      },
      {
        heading: "Common fields",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "base URL", description: "The instance URL of the target system (for example https://acme.atlassian.net)." },
              { name: "email or user", description: "The integration account used for authentication." },
              { name: "API token or password", description: "Stored encrypted in object storage. Never returned in plain text after save." }
            ]
          },
          { kind: "note", text: "Connector logos are local SVGs bundled in the app. Audity remains fully usable in offline environments." }
        ]
      }
    ]
  },
  {
    id: "admin-branding",
    title: "Admin: Branding",
    category: "admin",
    audience: "admin",
    keywords: ["branding", "logo", "primary color", "secondary color", "accent color", "header text", "footer text", "watermark", "confidentiality label", "report"],
    summary: "Configure the appearance of generated reports and certain UI accents.",
    sections: [
      {
        heading: "Brand fields",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Logo", description: "Upload a PNG or SVG. Used on report covers and exports." },
              { name: "Primary color", description: "Main accent color in hex (for example #008CFF)." },
              { name: "Secondary color", description: "Secondary accent in hex." },
              { name: "Accent color", description: "Third accent in hex." },
              { name: "Header text", description: "Text rendered on report headers." },
              { name: "Footer text", description: "Text rendered on report footers." },
              { name: "Confidentiality label", description: "Banner text such as Confidential, Internal, or Restricted." },
              { name: "Watermark", description: "Optional watermark text overlaid on report pages." }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "smtp-settings",
    title: "Admin: Email Settings (SMTP)",
    category: "admin",
    audience: "admin",
    keywords: ["smtp", "email", "sender", "outgoing mail", "tls", "smtp host", "smtp port", "smtp user", "smtp password", "test mail"],
    summary: "Configure SMTP for outbound email (notifications, report delivery).",
    sections: [
      {
        heading: "Configure SMTP",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "SMTP Host", description: "Hostname of the SMTP server (for example smtp.sendgrid.net or smtp.gmail.com)." },
              { name: "SMTP Port", description: "Usually 587 for STARTTLS or 465 for implicit TLS." },
              { name: "SMTP TLS", description: "Enable STARTTLS. Recommended on." },
              { name: "SMTP User", description: "Auth user. Often the sender address." },
              { name: "SMTP Password", description: "Stored encrypted. Cannot be displayed after save." },
              { name: "Sender", description: "From address of outgoing mail." }
            ]
          },
          {
            kind: "steps",
            intro: "Test delivery:",
            items: [
              "Open Admin Panel and click Email Settings.",
              "Fill the fields and click Save.",
              "Click Send test mail and enter your address. Verify the email arrives and the From field matches the configured Sender."
            ]
          }
        ]
      }
    ]
  },
  {
    id: "admin-backup",
    title: "Admin: Backup and Restore",
    category: "admin",
    audience: "admin",
    keywords: ["backup", "restore", "manifest", "downloadable zip", "full backup", "database backup", "evidence backup", "cron", "schedule", "retention"],
    summary: "Create manual or scheduled backups and restore from a backup package.",
    sections: [
      {
        heading: "Create a manual backup",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open Admin Panel and click Backup.",
              "Choose Full (database plus evidence plus reports), Database (only the database dump), or Evidence (only object storage).",
              "Click Trigger backup. The job runs in the background and shows up in the Backup jobs list. Click Refresh to see the latest status."
            ]
          },
          {
            kind: "steps",
            intro: "Download an encrypted backup package:",
            items: [
              "Click Download package backup. Audity creates a Full backup and packages it as an encrypted zip.",
              "Audity shows the generated one time password. Copy it and store it safely. You cannot retrieve it again.",
              "When the job completes, the Download link becomes active. The link expires after 10 minutes by default."
            ]
          }
        ]
      },
      {
        heading: "Configure scheduled backups",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Automatic backups enabled", description: "Switch automatic backups on or off." },
              { name: "Backup type", description: "Full, Database, or Evidence." },
              { name: "Include sections", description: "Toggle which sections are included (database, evidence files, reports, framework imports, audit logs, activity logs, system settings, notifications)." },
              { name: "Schedule timezone", description: "IANA timezone such as Europe/Oslo." },
              { name: "Schedule cron", description: "Standard 5 field cron expression. Default 0 2 * * * runs daily at 2 am in the chosen timezone." },
              { name: "Retention days", description: "How long old backups are kept before deletion." }
            ]
          }
        ]
      },
      {
        heading: "Restore from a backup",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the Backup tab.",
              "In the Backup jobs list, locate a completed backup and click Restore.",
              "Audity shows a pre check with backup metadata and content summary.",
              "Type the safety phrase RESTORE AUDITY in the confirmation field. The phrase stays in English as a safety guard against accidental confirmation during a localized session.",
              "Click Confirm restore. Audity restores the database and evidence content. The application restarts and forces all users to sign in again."
            ]
          },
          { kind: "warning", text: "Restore is destructive. All data created after the backup point will be lost. Always download a fresh backup before restoring." }
        ]
      },
      {
        heading: "Backup contents",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "database.dump", description: "PostgreSQL custom format dump created with pg_dump. Restore with pg_restore." },
              { name: "evidence/", description: "Folder with copied evidence objects from the evidence bucket." },
              { name: "evidence-manifest.json", description: "Manifest of evidence object keys, source paths, copied keys, and metadata. Used to verify completeness." }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "admin-disaster-recovery",
    title: "Admin: Disaster Recovery Flow",
    category: "admin",
    audience: "admin",
    keywords: [
      "disaster",
      "recovery",
      "dr",
      "recovery phrase",
      "encryption key",
      "AUDITY_ENCRYPTION_KEY",
      "fingerprint",
      "lost server",
      "lost host",
      "rebuild",
      "rotate key",
      "archive",
      "bundle",
      "restore",
      "emergency",
      "wiederherstellung",
      "notfall"
    ],
    summary:
      "Step-by-step playbook for recovering a lost Audity instance, rotating the encryption key, and re-importing archived bundles. Spells out exactly when and where each value must be entered.",
    sections: [
      {
        heading: "Before disaster strikes — what you must already have",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Audity disaster recovery only works if THREE pieces of information were preserved BEFORE the incident. Without them, encrypted backups and archive bundles cannot be decrypted. Audity cannot recover any of these for you."
          },
          {
            kind: "fields",
            items: [
              {
                name: "1. The recovery phrase",
                description:
                  "72 hex characters in 6 groups of 12 (e.g. a1b2c3d4e5f6-…). Shown to the Instance Admin on the very first setup-wizard screen, and any time by running the CLI script (see below). Treat it like a master password. Store it in a password manager AND on paper in a safe."
              },
              {
                name: "2. The latest encrypted backup package",
                description:
                  "Created via Admin → Backup → Download package backup. Each download produces a fresh encrypted zip and a one-time password. Keep the zip and the password in separate locations."
              },
              {
                name: "3. The monthly archive bundles (if archive system is used)",
                description:
                  "Files named YYYY-MM.audity-archive under /app/archive/bundled/. Copy them to off-site storage on a schedule that matches your retention policy."
              }
            ]
          },
          {
            kind: "warning",
            text:
              "If you lose the recovery phrase / encryption key, no encrypted backup zip and no archive bundle can ever be decrypted again. There is no back door. Test the recovery flow at least once per year while you still have all three pieces."
          }
        ]
      },
      {
        heading: "Where to see the current fingerprint (sanity check anytime)",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Each instance has an encryption-key fingerprint (16-character hex prefix of sha256(AUDITY_ENCRYPTION_KEY)). The fingerprint is shown in two places so admins can confirm the running instance still uses the expected key."
          },
          {
            kind: "steps",
            intro: "In the Audity UI:",
            items: [
              "Sign in as Instance Admin.",
              "Open Admin Panel → System Monitor.",
              "Scroll to the Server status card. The Encryption-key fingerprint row shows the current fingerprint and whether the recovery phrase has been acknowledged.",
              "Compare this value against the fingerprint you wrote down with the recovery phrase. If they differ, the encryption key changed since you last stored the phrase — see the key rotation section below."
            ]
          },
          {
            kind: "steps",
            intro: "From a host shell (no login required):",
            items: [
              "SSH into the host that runs the Audity Docker stack.",
              "Run: docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js",
              "The script prints the full 72-character recovery phrase, the full fingerprint, and a short fingerprint. Anyone with shell access can run this — make sure your SSH access is locked down."
            ]
          },
          {
            kind: "code",
            language: "bash",
            text:
              "docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js"
          }
        ]
      },
      {
        heading: "Scenario A — Full rebuild after host loss",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Use this when the Audity host is gone (hardware failure, deleted VM, lost cloud account, ransomware wipe). You will provision a fresh host, restore the database from a backup, and tell the new instance to decrypt with the original key."
          },
          {
            kind: "steps",
            intro: "Step 1 — Provision a fresh host:",
            items: [
              "Install Docker + Docker Compose on a new machine.",
              "Clone or copy your Audity repository (the one with docker-compose.yml).",
              "Do NOT bring the stack up yet."
            ]
          },
          {
            kind: "steps",
            intro: "Step 2 — Set the original encryption key in the .env file BEFORE the first compose up:",
            items: [
              "Open the .env file next to docker-compose.yml in a text editor.",
              "Find the line AUDITY_ENCRYPTION_KEY=... (or add it if missing).",
              "Set it to the EXACT value the previous instance used. If you only have the recovery phrase, that phrase IS the human-readable form of the key — convert it back: paste the phrase into the field. The phrase has the same entropy as the raw key; either form is accepted on input because Audity derives the actual AES key via sha256() either way.",
              "Save the file."
            ]
          },
          {
            kind: "warning",
            text:
              "The encryption key MUST be set before the API container starts for the first time. If you let Audity boot with a fresh random key, it will generate a new fingerprint, and no old backup/archive can ever be decrypted with that instance again."
          },
          {
            kind: "steps",
            intro: "Step 3 — Start the stack and wait for the database to come up:",
            items: [
              "Run: docker compose up -d",
              "Wait for the audity-api container to be healthy (docker compose ps shows healthy)."
            ]
          },
          {
            kind: "code",
            language: "bash",
            text:
              "docker compose up -d\ndocker compose ps\n# wait until audity-api shows 'healthy'"
          },
          {
            kind: "steps",
            intro: "Step 4 — Confirm the fingerprint matches your stored value:",
            items: [
              "Run: docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js",
              "Compare the printed fingerprint to the one you wrote down next to your recovery phrase.",
              "If they MATCH → continue with Step 5.",
              "If they do NOT match → STOP. The key in .env is wrong. Fix .env (correct phrase / correct key value), run: docker compose down audity-api && docker compose up -d audity-api, then re-check."
            ]
          },
          {
            kind: "steps",
            intro: "Step 5 — Restore the most recent encrypted backup:",
            items: [
              "Copy the encrypted backup zip (e.g. audity-backup-2026-06-15.zip) onto the new host.",
              "Sign into the fresh Audity instance as Instance Admin. Note: at this point the new instance has only the admin you create during the setup wizard — that user is separate from any user inside the backup.",
              "Open Admin Panel → Backup.",
              "Use 'Upload backup package' (or place the zip directly into the audity-backups MinIO bucket via the worker import path documented in Admin → Backup → Help).",
              "Once the package is registered as a backup job, click Restore on it.",
              "Audity asks for the one-time password that was generated when the backup was downloaded. Paste it.",
              "Type the safety phrase RESTORE AUDITY (exactly, English, case sensitive) into the confirmation field.",
              "Click Confirm restore. The DB and evidence are reloaded; the app restarts; all users must sign in again."
            ]
          },
          {
            kind: "note",
            text:
              "After the restore, log in with the credentials of an admin that existed in the backup (not the temporary setup-wizard admin). The temporary setup-wizard admin is overwritten by the backup."
          },
          {
            kind: "steps",
            intro: "Step 6 — Re-import archive bundles (only if you use the archive system):",
            items: [
              "Copy each YYYY-MM.audity-archive file onto the new host.",
              "Open Admin Panel → Archive → Re-import.",
              "Upload one bundle at a time. Audity decrypts each with the current encryption key (which now matches the original).",
              "After upload, the archived customers appear under Admin → Archive → Customer overview in 'spool' state.",
              "If users need to access an archived customer's data, ask them to file a restore request, then approve it under Admin → Archive → Restore requests. Approval re-uploads the evidence to MinIO."
            ]
          },
          {
            kind: "warning",
            text:
              "If a bundle fails to decrypt with 'Bundle decryption failed', the encryption key currently running does not match the key the bundle was written with. Either fix AUDITY_ENCRYPTION_KEY (see Scenario A Step 2), or follow Scenario C (key rotation) to use the original key."
          }
        ]
      },
      {
        heading: "Scenario B — Rotate AUDITY_ENCRYPTION_KEY (planned)",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Use this when policy requires a periodic key rotation, or when you suspect the recovery phrase was exposed. The procedure produces a new key + a new recovery phrase, and re-encrypts any data that is still encrypted with the old key."
          },
          {
            kind: "warning",
            text:
              "Rotation is a one-way operation. After rotation, the OLD recovery phrase no longer decrypts NEW backups or NEW archive bundles. You MUST keep the old phrase available until every old backup / bundle you care about has been re-encrypted under the new key, OR until you have deleted them."
          },
          {
            kind: "steps",
            intro: "Step 1 — Prepare a fresh backup with the old key:",
            items: [
              "Sign in as Instance Admin → Admin Panel → Backup → Download package backup.",
              "Store the encrypted zip + the one-time password somewhere safe. This is your 'last known good' state under the old key."
            ]
          },
          {
            kind: "steps",
            intro: "Step 2 — Generate a new encryption key:",
            items: [
              "On the host, generate 32 random bytes and encode them as base64: openssl rand -base64 32",
              "Copy the output. This is your new AUDITY_ENCRYPTION_KEY value."
            ]
          },
          {
            kind: "code",
            language: "bash",
            text: "openssl rand -base64 32"
          },
          {
            kind: "steps",
            intro: "Step 3 — Save the OLD key and the NEW key to a vault:",
            items: [
              "Both the old key and the new key must be stored. The old key is needed to re-import any archive bundles created before the rotation.",
              "Label them clearly with the rotation date."
            ]
          },
          {
            kind: "steps",
            intro: "Step 4 — Apply the new key and restart:",
            items: [
              "Edit .env on the host, replace AUDITY_ENCRYPTION_KEY with the new value, save.",
              "Run: docker compose down audity-api && docker compose up -d audity-api",
              "After audity-api is healthy, confirm Admin → System Monitor shows the NEW fingerprint (the 'Phrase acknowledged' badge will turn yellow until you acknowledge the new phrase)."
            ]
          },
          {
            kind: "steps",
            intro: "Step 5 — View and store the new recovery phrase:",
            items: [
              "Run: docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js",
              "Write down the new phrase + new fingerprint.",
              "In the UI: Admin → System Monitor → click the (re-)acknowledge action to mark the new phrase as stored."
            ]
          },
          {
            kind: "steps",
            intro: "Step 6 — Re-encrypt anything you want to keep portable:",
            items: [
              "Download a fresh backup (Admin → Backup → Download package backup). This new zip uses the new key.",
              "Trigger a manual archive bundle for the current month (Admin → Archive → Bundles → Bundle now). The new bundle uses the new key.",
              "Old backups + old bundles remain decryptable with the OLD key only."
            ]
          }
        ]
      },
      {
        heading: "Scenario C — Re-import a bundle that was written with a DIFFERENT key",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Used when restoring archive bundles from a previous owner, from a different Audity instance, or after a key rotation. The bundle is encrypted with key X, but the running instance uses key Y."
          },
          {
            kind: "steps",
            intro: "Procedure:",
            items: [
              "Note the fingerprint of the bundle's original key (it was logged by the instance that created the bundle).",
              "Decide whether you want the running instance to PERMANENTLY use the old key (then follow Scenario A Step 2 with the old key) or whether you want a one-time decrypt only.",
              "For permanent: edit .env → AUDITY_ENCRYPTION_KEY = old key → docker compose restart audity-api → fingerprint should now equal the bundle's original fingerprint → upload via Admin → Archive → Re-import.",
              "For one-time decrypt only: spin up a temporary Audity instance on a workstation with the old key in .env, re-import the bundle there, download a fresh backup from the temporary instance with the NEW key (after rotating its key), then import that backup into the real production instance."
            ]
          },
          {
            kind: "note",
            text:
              "There is intentionally no 'paste an override key into the UI' button — that would be a permanent exfiltration risk. Key changes always go through the .env + restart path so they are auditable on the host."
          }
        ]
      },
      {
        heading: "Scenario D — Lost recovery phrase, instance still running",
        blocks: [
          {
            kind: "paragraph",
            text:
              "If the instance is still up, you can recover the phrase from the running container, then re-store it."
          },
          {
            kind: "steps",
            items: [
              "Run: docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js",
              "Copy the printed phrase and fingerprint to your password manager AND a printed copy in a safe.",
              "Open Admin Panel → System Monitor and confirm the fingerprint matches.",
              "If anyone else might have seen the phrase or had shell access to the host: rotate the key (Scenario B)."
            ]
          },
          {
            kind: "warning",
            text:
              "If the instance is also lost AND the phrase is lost, recovery is impossible. The encryption is by design unbypassable. Make sure the phrase lives in at least two physically separated locations."
          }
        ]
      },
      {
        heading: "Yearly DR drill — recommended checklist",
        blocks: [
          {
            kind: "paragraph",
            text:
              "Run this drill once per year, ideally a quarter before any planned key rotation. It catches missing phrases, expired off-site backups, and operator-procedure gaps while everything still works."
          },
          {
            kind: "steps",
            items: [
              "Download a fresh encrypted backup package and note the one-time password.",
              "Spin up an Audity stack on a clean test host or VM. Use the SAME AUDITY_ENCRYPTION_KEY as production (so the test instance can decrypt the backup).",
              "Confirm the fingerprint matches: docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js",
              "Restore the backup on the test instance. Verify a known customer + a known assessment appear with their evidence + reports.",
              "Re-import the most recent archive bundle on the test instance. Approve one restore request. Verify the evidence comes back online.",
              "Destroy the test instance. Document the time spent and any operator friction so the runbook can be tightened."
            ]
          }
        ]
      },
      {
        heading: "Quick reference table — where each value goes",
        blocks: [
          {
            kind: "fields",
            items: [
              {
                name: "AUDITY_ENCRYPTION_KEY",
                description:
                  "Host .env file next to docker-compose.yml. Read at API container start. Restart the audity-api container after any change."
              },
              {
                name: "Recovery phrase (72 hex chars)",
                description:
                  "Shown once during setup wizard. Re-displayable via docker exec audity-api node apps/api/dist/scripts/printRecoveryPhrase.js. Never entered into the UI — the phrase is the user-readable form of the key, the key goes into .env."
              },
              {
                name: "Backup one-time password",
                description:
                  "Displayed in the Admin → Backup page right after Download package backup. Required to decrypt the zip during restore. Audity does not store it."
              },
              {
                name: "Safety phrase 'RESTORE AUDITY'",
                description:
                  "Typed into Admin → Backup → Restore confirmation field. Hard-coded English string, intentional."
              },
              {
                name: "Archive bundle file (YYYY-MM.audity-archive)",
                description:
                  "Found under /app/archive/bundled/ inside the audity-api container, or in the audity-archive Docker volume on the host. Uploaded via Admin → Archive → Re-import."
              }
            ]
          }
        ]
      }
    ],
    related: ["admin-backup", "server-status", "smtp-settings"]
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard shortcuts",
    category: "reference",
    audience: "user",
    keywords: ["keyboard", "shortcuts", "hotkeys", "command palette", "cmd k", "ctrl k", "escape", "tab"],
    summary: "All keyboard shortcuts available in Audity.",
    sections: [
      {
        heading: "Global",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Cmd+K / Ctrl+K", description: "Open the Command Palette." },
              { name: "Esc", description: "Close the active overlay (Command Palette, Help Drawer, Modal, Notifications drawer)." },
              { name: "?", description: "Open the Help Drawer (when not focused in an input)." },
              { name: "Tab / Shift+Tab", description: "Move focus through form fields and buttons." }
            ]
          }
        ]
      },
      {
        heading: "Guided Questions",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Space (on a roadmap or drag card)", description: "Grab a draggable card. Use arrow keys to move and Space again to drop." }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "glossary",
    title: "Glossary",
    category: "reference",
    audience: "user",
    keywords: ["glossary", "terms", "definitions", "control", "framework", "domain", "category"],
    summary: "Plain English definitions for terms used in Audity.",
    sections: [
      {
        heading: "Terms",
        blocks: [
          {
            kind: "fields",
            items: [
              { name: "Framework", description: "A set of controls grouped into domains and categories. Examples: NIST CSF 2.0, ISO 27001:2022 Annex A." },
              { name: "Domain", description: "Top level grouping in a framework. NIST CSF has 6 functions, ISO 27001 Annex A has 4 themes, IEC 62443-3-3 has 7 foundational requirements." },
              { name: "Category", description: "Sub grouping inside a domain. Each category contains several controls." },
              { name: "Control / Subcategory / Requirement", description: "A single requirement that needs to be assessed. Examples: NIST CSF GV.OC-01, ISO A.5.1, IEC SR 1.1." },
              { name: "Question", description: "The form Audity shows for each control. Holds the score, answer state, evidence status, confidence, and notes." },
              { name: "Score", description: "Maturity score on a 0 to 5 scale." },
              { name: "Finding", description: "Documented gap or observation that requires action." },
              { name: "Risk", description: "Identified threat to the organization tracked through likelihood, impact, treatment, and residual risk." },
              { name: "Evidence", description: "Document or artifact that demonstrates a control is implemented." },
              { name: "Roadmap", description: "Sequenced plan of actions to close findings and treat risks." },
              { name: "Readiness workflow", description: "Audity native assessment content that lets a customer evaluate readiness against a standard without including the licensed text of the standard." }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "framework-import",
    title: "Import a framework from CSV",
    category: "admin",
    audience: "admin",
    keywords: ["framework", "import", "csv", "upload", "user_frameworks", "audity_frameworks"],
    summary: "How an Instance Admin uploads a CSV of a licensed framework and Audity generates a complete YAML, optionally enriched by an LLM, that admins can review and publish.",
    screenshot: "Screenshot: Admin Panel > Framework Library > Import section with Upload CSV button and Drafts list",
    sections: [
      {
        heading: "When to use this",
        blocks: [
          { kind: "paragraph", text: "Audity ships with several built-in frameworks (visible with the 'shipped' badge). When you have purchased or licensed a framework that is not shipped — for example a tenant-specific policy or a paid standard catalogue — you upload it as a CSV and Audity converts it into the same YAML schema as the built-in ones. Tenant-uploaded frameworks carry the 'user' badge." }
        ]
      },
      {
        heading: "Folder layout (for the maintainer)",
        blocks: [
          { kind: "fields", items: [
            { name: "audity_frameworks/", description: "Read-only on the running container. Built-in frameworks that ship with Audity live here." },
            { name: "user_frameworks/", description: "Read-write bind-mount. Generated YAMLs from CSV uploads land here, along with their original source files under _sources/." },
            { name: "frameworks/ (legacy)", description: "Older path supported for backwards compatibility. Migrate to audity_frameworks/ when you publish updates." }
          ] }
        ]
      },
      {
        heading: "CSV format",
        blocks: [
          { kind: "paragraph", text: "Download the CSV template via Admin Panel > Framework Library > Download CSV Template. The header row is fixed: required columns are control_id, title and requirement. Optional columns are domain, weight (1, 2 or 3), tags (semicolon or comma separated) and source_reference." },
          { kind: "code", language: "csv", text: "control_id,domain,title,requirement,weight,tags\nA.5.1,Organisational,Policies for information security,The organization shall define, approve, communicate and review information security policies.,3,policy;governance" }
        ]
      },
      {
        heading: "Upload and review",
        blocks: [
          { kind: "steps", items: [
            "Open Admin Panel > Framework Library.",
            "In the Framework Import section, click '+ CSV hochladen'.",
            "Fill in framework_key (unique slug), display name, version and language.",
            "Select your CSV file. Maximum 25 MB.",
            "Click 'Upload starten'. Audity stages the file under user_frameworks/_sources/ and creates a draft.",
            "If an AI provider is configured (see 'AI & Integrations'), Audity enriches each control with question, purpose, expectedOutcome, howTo and evidenceExamples. With AI off, fields contain TODO placeholders for you to fill manually.",
            "Open the draft from the 'Drafts ready for review' section. Each control is editable inline; fields auto-save on blur. Use '♻ Re-generate' to ask the LLM again. Mark a control 'Approved' or 'TODO' as you go.",
            "When satisfied, click 'Commit Framework'. The YAML is written to user_frameworks/ and appears in the Library within seconds."
          ] }
        ]
      },
      {
        heading: "Deleting a user-uploaded framework",
        blocks: [
          { kind: "paragraph", text: "Open the framework in the Library and use the Delete action. The YAML file is removed from user_frameworks/ and the framework is archived in the database — existing assessment answers stay visible but read-only." }
        ]
      }
    ]
  },
  {
    id: "ai-integrations",
    title: "AI & Integrations",
    category: "admin",
    audience: "admin",
    keywords: ["ai", "llm", "ollama", "anthropic", "claude", "openai", "api key", "integrations"],
    summary: "How to configure the LLM provider Audity uses to enrich framework imports. Off is the default; you opt in when you connect Ollama, Anthropic or OpenAI.",
    sections: [
      {
        heading: "Where it lives",
        blocks: [
          { kind: "paragraph", text: "Admin Panel > AI & Integrations. Three tabs: Provider, Usage and Test Console. AI is optional: with provider set to 'Off', framework imports still work — generated YAMLs contain TODO placeholders that you fill in manually." }
        ]
      },
      {
        heading: "Provider options",
        blocks: [
          { kind: "fields", items: [
            { name: "Off (default)", description: "No outbound AI calls. Framework imports produce TODO placeholders." },
            { name: "Ollama (self-hosted)", description: "You install Ollama on the host (e.g. brew install ollama && ollama pull llama3.1:8b). Audity reaches it via the configured HTTP endpoint, by default http://host.docker.internal:11434. No data leaves your network." },
            { name: "Anthropic (Claude)", description: "Cloud API. Get an API key at console.anthropic.com → API Keys. Only control title + requirement are sent — no audit answers, no customer data, no PII." },
            { name: "OpenAI", description: "Cloud API. Get an API key at platform.openai.com → API keys. Same data scope as Anthropic." }
          ] }
        ]
      },
      {
        heading: "Configuring a provider",
        blocks: [
          { kind: "steps", items: [
            "Pick the provider from the Provider tab.",
            "Confirm or override the endpoint URL and model.",
            "For external providers, paste your API key. Audity stores it encrypted; the key field is never displayed again — the UI only shows '••••••••• (saved)'.",
            "Click 'Test Connection'. A short call validates the credentials and shows the latency.",
            "Click 'Save'. Subsequent framework imports use the new provider; existing drafts can be re-generated control by control."
          ] }
        ]
      },
      {
        heading: "Usage & cost tracking",
        blocks: [
          { kind: "paragraph", text: "The Usage tab lists tokens-in, tokens-out and estimated cost in USD per provider over the last 30 days. The numbers are derived from the framework_imports records, so they include drafts that were never committed." }
        ]
      },
      {
        heading: "Test Console",
        blocks: [
          { kind: "paragraph", text: "Paste a title and a requirement, pick a language, click 'Enrich'. The console shows the JSON the LLM would produce for that control — useful to validate prompt quality before processing a large CSV." }
        ]
      },
      {
        heading: "Privacy notes",
        blocks: [
          { kind: "warning", text: "External providers (Anthropic, OpenAI) receive the strings you author in the framework CSV (title + requirement). Treat those strings as published — never include customer-specific or classified content. Audit answers, evidence files and tenant data never reach any AI provider." }
        ]
      }
    ]
  },
  {
    id: "server-status",
    title: "Server status & system problems",
    category: "admin",
    audience: "admin",
    keywords: ["status", "monitoring", "system", "problems", "ip", "hostname", "metrics", "uptime"],
    summary: "What the System Monitor card shows, how Audity detects environmental and database issues, and how to interpret the problem badges.",
    sections: [
      {
        heading: "Server status card",
        blocks: [
          { kind: "fields", items: [
            { name: "Hostname", description: "The container's hostname — useful when running multiple instances." },
            { name: "Public URL", description: "The AUDITY_PUBLIC_URL the API knows about. If this differs from how you reached the UI, your CSP and CORS may also need updating." },
            { name: "Uptime", description: "Seconds since the API process started. Reset by every container restart, deploy or update." },
            { name: "Platform / Node / CPU cores / Load average / Memory", description: "Host runtime info via Node's os module. Memory %, load average and CPU count help size the host." },
            { name: "Network interfaces", description: "All non-internal NICs the container sees. Useful when troubleshooting reverse-proxy routing." }
          ] }
        ]
      },
      {
        heading: "System Problems",
        blocks: [
          { kind: "paragraph", text: "Audity continuously evaluates a small set of health checks and surfaces them as red badges in the dashboard:" },
          { kind: "fields", items: [
            { name: "High CPU load", description: "Triggered when the 1-minute load average exceeds 90% of cores." },
            { name: "High memory usage", description: "Triggered when used memory exceeds 90% of total." },
            { name: "Low free storage", description: "Triggered when disk usage on the data volume exceeds 90%." },
            { name: "Database unreachable", description: "A 'select 1' probe against the Postgres pool failed. Investigate audity-db logs and connection string." },
            { name: "Stuck framework imports", description: "Imports that have not made progress in 10 minutes. Open the import in Framework Library > Drafts to retry or discard." }
          ] }
        ]
      }
    ]
  },
  {
    id: "admin-user-management",
    title: "User management & password resets",
    category: "admin",
    audience: "admin",
    keywords: ["users", "invite", "password", "reset", "admin", "user management"],
    summary: "How to invite new users, reset a user's password, and what password rules Audity enforces.",
    sections: [
      {
        heading: "Inviting a user",
        blocks: [
          { kind: "paragraph", text: "Open Admin Panel > User Management. Fill the invite form with email, full name and role. The admin form intentionally ignores any password field — Audity always generates a 24-character random password (mixed case, digits, special characters)." },
          { kind: "warning", text: "After clicking Invite, Audity shows the one-time password in a dialog. Copy it now — it is never displayed again. Deliver it to the new user through a secure side channel (in person, password manager share, encrypted message)." }
        ]
      },
      {
        heading: "Resetting a user's password",
        blocks: [
          { kind: "steps", items: [
            "Open Admin Panel > User Management.",
            "Find the user row.",
            "Click 'Reset password'.",
            "Audity generates a new 24-character password, replaces the hash in the database, and shows it in the same one-time dialog used for invites.",
            "Copy the password (button) and deliver it to the user. They should change it on first login.",
            "Click 'I've saved it' to close — the password is wiped from screen and memory."
          ] }
        ]
      },
      {
        heading: "Password policy when users change their own password",
        blocks: [
          { kind: "paragraph", text: "User Settings > Change password enforces the following rules. The form blocks submission until all criteria are met:" },
          { kind: "fields", items: [
            { name: "Length", description: "At least 16 characters." },
            { name: "Letters", description: "At least one uppercase and one lowercase letter." },
            { name: "Digits", description: "At least one digit." },
            { name: "Special characters", description: "At least one symbol from !@#$%^&*+_-=?" }
          ] }
        ]
      }
    ]
  }
];

// Legacy compatibility: keep manualSections export shape for the Help Drawer search.
export const manualSections = manualArticles.map((article) => ({
  id: article.id,
  title: article.title,
  screenshot: article.screenshot ?? `Screenshot: ${article.title}`,
  body: [
    article.summary,
    ...article.sections.flatMap((section) => [
      section.heading,
      ...section.blocks.flatMap((block) => {
        if (block.kind === "paragraph") return [block.text];
        if (block.kind === "note") return [`Note: ${block.text}`];
        if (block.kind === "warning") return [`Warning: ${block.text}`];
        if (block.kind === "steps") return block.items;
        if (block.kind === "fields") return block.items.map((item) => `${item.name}: ${item.description}`);
        if (block.kind === "code") return [block.text];
        return [];
      })
    ])
  ]
}));
