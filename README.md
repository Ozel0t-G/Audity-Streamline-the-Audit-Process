# Audity — Streamline the Cybersecurity Audit Process

<p align="center">
  <img width="256" height="256" alt="image" src="https://github.com/user-attachments/assets/f82acd21-5df9-4865-b79d-802dec8c7fad" />
</p>

**Audity** is a local-first, security-first audit and assessment workspace for cybersecurity consultants, CISOs, GRC teams, auditors, and security managers.

The application guides users step by step through structured cybersecurity and compliance assessments, from initial client setup to scope definition, control evaluation, finding review, risk register generation, remediation roadmap planning, and final report export.

Audity is designed for sensitive audit, security, and GRC work where client data, assessment evidence, internal control weaknesses, risk ratings, and remediation plans should not be uploaded to an external SaaS platform by default.

Unlike hosted web services, Audity runs locally on the user’s machine through a lightweight local web server. Productive assessment data is written to a real local project file in a folder selected by the user through the browser’s File System Access API. This follows a **local-first, security-first** operating model: keep sensitive client data close to the assessor, reduce unnecessary exposure, and avoid placing confidential assessment material on external infrastructure unless there is a clear business, legal, and contractual basis for doing so.

This design aligns with common security and GRC principles. ISO/IEC 27001 describes an ISMS as a structured system for managing risks related to information handled by an organization and emphasizes confidentiality, integrity, and availability of information assets. NIST CSF 2.0 is intended to help organizations understand, assess, prioritize, and communicate cybersecurity risk. NIS2 Article 21 requires appropriate and proportionate technical, operational, and organizational measures to manage risks to network and information systems. Audity is built around the same practical idea: assessment data should be handled with the same care as the risks being assessed.

<img width="1021" height="467" alt="Bildschirmfoto 2026-05-15 um 14 16 14" src="https://github.com/user-attachments/assets/5ef8bef4-e89f-4f90-9bbe-0072d910f405" />


## Why Audity Exists
Many audits and security assessments still happen across spreadsheets, Word documents, screenshots, interview notes, and manually maintained risk registers. That works, but it is inefficient, inconsistent, and hard to reproduce.

Audity solves this by providing a guided assessment workflow that standardizes how security assessments are performed, documented, reviewed, and reported.

The goal is not to replace professional judgment. The goal is to make the assessment process cleaner, faster, more consistent, and easier to explain to clients, management, auditors, and technical teams.



## Core Design Principles

### Local First

Audity is not a hosted SaaS platform. It runs locally through a lightweight local web server on the user’s machine.

This matters because cybersecurity assessments often contain highly sensitive information, including:

- security weaknesses
- missing controls
- privileged access issues
- incident response gaps
- backup and recovery weaknesses
- regulatory exposure
- internal risk ratings
- client infrastructure context
- remediation priorities
- audit evidence metadata

This type of information should not be uploaded to a third-party web service by default.

### Security First

Audity is designed for environments where confidentiality and control over assessment data matter.

The application keeps the assessment workflow local and supports project export/import so that users remain in control of how audit data is stored, transferred, backed up, and archived.

### Guided Workflow

Audity is not built as a complex GRC database where users must understand every module before starting.

Instead, it guides the user through a clear process:

```text
Setup
→ Scope & Context
→ Guided Questions
→ Finding Review
→ Risk & Roadmap
→ Report
```

The user always knows what the next step is.

### Human-in-the-Loop Assessment

Audity can suggest findings, priorities, risks, and roadmap actions based on assessment answers and business context.

However, the user remains the final decision-maker.

Suggested findings must be reviewed, accepted, edited, or dismissed before they become part of the report.



# Application Features

## 1. Guided Assessment Flow

Audity uses a step-by-step assessment workflow instead of exposing users to a complicated module structure.

The main assessment flow consists of:

```text
1. Setup
2. Scope & Context
3. Guided Questions
4. Finding Review
5. Risk & Roadmap
6. Report
```

Each step is designed around one clear task and one primary user decision.



## 2. Assessment Setup

The setup process helps the user define the assessment before any control questions are answered.

Supported setup fields include:

- client or organization name
- assessment type
- report audience
- selected security frameworks
- report language
- assessment status
- target date
- business context

Example assessment types:

- Full Security Maturity Assessment
- ISO 27001 Readiness Assessment
- NIS2 Readiness Assessment
- Ransomware Readiness Assessment
- Incident Response Readiness Assessment
- SOC / Detection Maturity Assessment
- Third-Party Risk Assessment



## 3. Scope & Context Management

Audity helps the user define the scope before scoring controls.

This includes:

- in-scope domains
- out-of-scope areas
- critical systems
- business-critical processes
- regulatory context
- key assumptions
- known limitations
- business criticality level

This is important because the same technical weakness can have a very different risk rating depending on the organization’s context.

For example, missing restore testing in a small non-critical environment is serious. Missing restore testing in healthcare, finance, or critical infrastructure can be critical.



## 4. Guided Questions

<img width="1021" height="467" alt="Bildschirmfoto 2026-05-15 um 14 19 40" src="https://github.com/user-attachments/assets/44da0a40-87b4-4f62-b000-f959015970d5" />


The assessment questionnaire is presented domain by domain.

Instead of showing the user a large spreadsheet-like control table, Audity presents clear assessment cards.

Each question can include:

- control question
- plain-language explanation
- domain
- mapped framework controls
- answer status
- maturity score
- evidence status
- confidence level
- notes
- suggested finding logic

Supported maturity scoring:

```text
0 = Not existing
1 = Ad hoc
2 = Partially documented
3 = Defined and implemented
4 = Measured and regularly reviewed
5 = Optimized
```

Supported answer states:

```text
Yes
Partially
No
Unknown
Not applicable
```

Supported evidence states:

```text
Not requested
Requested
Provided
Reviewed
Missing
Outdated
Not applicable
```

Supported confidence levels:

```text
Low
Medium
High
```



## 5. Suggestion Engine

Audity includes a rule-based suggestion engine for Alpha testing.

The app can suggest:

- finding title
- finding priority
- business impact
- recommendation
- risk rating
- roadmap phase
- potential owner
- evidence warning

Example:

```text
Question:
Is MFA enforced for all privileged accounts?

Answer:
Partially

Business criticality:
High

Suggested finding:
Privileged accounts are not consistently protected with MFA.

Suggested priority:
Critical

Suggested roadmap phase:
0–30 days
```

The user can then:

```text
Accept
Edit
Dismiss
Review later
```



## 6. Finding Review

Potential findings are collected during the assessment and reviewed in a dedicated step.

This prevents the assessment flow from being interrupted while the user answers questions.

Each suggested finding can include:

- title
- category
- observation
- risk
- business impact
- recommendation
- priority
- likelihood
- impact
- affected systems
- owner
- due date
- roadmap phase
- framework mapping
- confidence level
- evidence status

Findings can be accepted, edited, or dismissed before being included in the final report.



## 7. Risk Register

Audity translates confirmed findings into structured risk register entries.

Risk records include:

- risk title
- description
- cause
- impact description
- likelihood score
- impact score
- calculated risk rating
- risk owner
- treatment option
- treatment plan
- due date
- status
- related findings

Supported treatment options:

```text
Mitigate
Accept
Transfer
Avoid
```

Risk scoring follows a simple likelihood x impact model:

```text
Risk Score = Likelihood x Impact
```

Rating model:

```text
1–4     = Low
5–9     = Medium
10–16   = High
17–25   = Critical
```



## 8. Roadmap Builder

Audity converts risks and findings into a remediation roadmap.

Roadmap phases:

```text
0–30 days
31–90 days
3–6 months
6–12 months
```

Roadmap items can include:

- title
- description
- linked finding
- linked risk
- priority
- owner
- effort
- dependency
- status
- target phase

The goal is to help the user move from assessment results to actionable remediation planning.



## 9. Report Preview

Audity includes a report preview area for reviewing assessment output before export.

The report structure can include:

- executive summary
- scope and methodology
- organization context
- scoring model
- maturity overview
- top risks
- detailed findings
- risk register
- quick wins
- remediation roadmap
- framework mapping
- evidence overview
- assumptions and limitations

For the Alpha version, the report can be printed or saved as PDF using the browser’s print functionality.



## 10. Local Project Folder Mode

Audity uses local project files for professional use.

At startup, the app checks whether the browser supports project folder mode:

```text
window.showDirectoryPicker
secure context
```

If this capability is missing, Audity does not start and does not fall back to IndexedDB or browser-local productive storage.

Recommended browser:

```text
Google Chrome
```

Alternative browser:

```text
Microsoft Edge
```

Not supported for productive use:

```text
Safari
Firefox
older browsers
mobile browsers
embedded WebViews without File System Access API
```

When a project folder is selected, Audity creates or opens:

```text
audity-project.cisoassess
```

The selected folder should be controlled by the user, for example a client project folder in Documents or an encrypted local workspace.

## 11. Project Export and Import

Audity can still export portable project copies as:

```text
*.cisoassess
```

This allows users to:

- back up assessment data
- move a project to another machine
- archive a client assessment
- share a project internally under controlled conditions
- restore a previous assessment state

The main project state is stored in the selected project folder, not in productive browser-local storage.



## 12. Framework Library

Audity Alpha includes initial support for the following frameworks and control libraries:

```text
ISO/IEC 27001:2022
NIS2
NIST Cybersecurity Framework 2.0
CIS Controls v8
MITRE ATT&CK
HIPAA Security Rule
NSM Grunnprinsipper for IKT-sikkerhet
```
<img width="1021" height="467" alt="Bildschirmfoto 2026-05-15 um 14 17 53" src="https://github.com/user-attachments/assets/7fdb52b9-9fb8-4d7a-925d-d506efb10ae3" />

The framework support in the Alpha version is intended for guided assessment structure, mapping, and testing. It should not yet be treated as a complete legal or certification-grade control catalogue.



## Planned Frameworks for Beta

Additional frameworks planned for the Beta version:

```text
DORA
NIST SP 800-53
NIST SP 800-61
ISO/IEC 27002:2022
SOC 2 Trust Services Criteria
```

Potential later additions:

```text
PCI DSS
CMMC
CSA Cloud Controls Matrix
GDPR assessment mapping
ENISA cybersecurity guidance mappings
```



# Installation and Local Execution

Audity is distributed as a portable local web application.

No cloud account is required.  
No hosted backend is required.  
No external database is required.  
No client data is uploaded to a remote web service by design.

The application is started through a small OS-specific launcher script. The launcher starts a local HTTP server and opens Audity in the default browser.

Default local URL:

```text
http://127.0.0.1:8787
```

This means Audity is only served locally on the user’s machine.



# macOS Installation

## Requirements

Audity requires a modern macOS system with a browser installed.

Recommended browsers:

```text
Google Chrome
Microsoft Edge
```

## Steps

1. Download the Audity ZIP package.

```text
Audity-Alpha.zip
```

2. Extract the ZIP archive.

3. Open the extracted folder.

4. Start the macOS launcher:

```text
START_MAC.command
```

5. If macOS Gatekeeper blocks the script, use:

```text
Right-click → Open
```

Then confirm the security prompt.

6. The launcher starts a local web server on:

```text
127.0.0.1:8787
```

7. Audity opens automatically in a new browser window.

## Technical Behavior

The macOS launcher starts a lightweight local HTTP server from the extracted application directory. The browser loads the static Audity frontend from localhost and requires project folder mode through the File System Access API.

No remote backend is contacted for application hosting.



# Linux Installation

## Requirements

Audity requires a Linux distribution with a modern browser and shell environment.

Recommended browsers:

```text
Google Chrome
Microsoft Edge
```

## Steps

1. Download the Audity ZIP package.

```text
Audity-Alpha.zip
```

2. Extract the archive.

Example:

```bash
unzip Audity-Alpha.zip
```

3. Enter the extracted directory.

```bash
cd Audity-Alpha
```

4. Make the launcher executable if required:

```bash
chmod +x start-linux.sh
```

5. Start Audity:

```bash
./start-linux.sh
```

6. The launcher starts a local web server on:

```text
127.0.0.1:8787
```

7. Audity opens in the default browser.

## Technical Behavior

The Linux launcher serves the local static application bundle through a local HTTP listener. The application executes in the browser runtime and stores assessment data in the selected local project folder.

No cloud-hosted application backend is required.



# Windows Installation

## Requirements

Audity requires Windows 10 or Windows 11 and a modern browser.

Recommended browsers:

```text
Microsoft Edge
Google Chrome
```

## Steps

1. Download the Audity ZIP package.

```text
Audity-Alpha.zip
```

2. Extract the ZIP archive.

Recommended location:

```text
C:\Users\<User>\Documents\Audity
```

3. Open the extracted folder.

4. Start the Windows launcher:

```text
START_WINDOWS.bat
```

5. If Windows SmartScreen or endpoint protection warns about the script, verify that the ZIP package came from a trusted internal source before allowing execution.

6. The launcher starts a local web server on:

```text
127.0.0.1:8787
```

7. Audity opens automatically in a new browser window.

## Technical Behavior

The Windows batch launcher starts a local web server from the extracted application directory and opens the local Audity frontend in the default browser. Audity requires a supported Chromium-based desktop browser for project folder mode.

The application is not hosted on an external web service and does not require a remote database.



# Security Model

## Local-First, Security-First

Audity follows a local-first security model because assessment data is sensitive by nature.

Cybersecurity and GRC assessments may contain:

```text
Known control weaknesses
Risk ratings
Infrastructure details
Identity and access gaps
Backup and recovery weaknesses
Incident response maturity gaps
Regulatory exposure
Supplier risk information
Management-level remediation priorities
```

This information can be valuable to attackers, competitors, insurers, auditors, regulators, and third parties. Hosting it by default on an external SaaS platform would increase the exposure surface and introduce additional vendor, contractual, jurisdictional, and data-processing considerations.

Audity avoids that default exposure by running locally.

## Framework Alignment

Audity’s local-first model supports common information security principles:

- **ISO/IEC 27001** focuses on managing risks related to information handled by an organization and preserving confidentiality, integrity, and availability.
- **NIST CSF 2.0** provides a structure for organizations to assess, prioritize, manage, and communicate cybersecurity risk.
- **NIS2 Article 21** requires appropriate and proportionate technical, operational, and organizational cybersecurity risk-management measures for network and information systems.

Audity applies these principles pragmatically by minimizing unnecessary data movement and keeping audit work local by default.

## Compliance Engine Alpha

Audity now includes a local compliance engine for framework readiness support.

The engine is data-driven and works from local static files only:

```text
Framework control database
Control-to-question mappings
Evidence expectations
Control evaluation
Framework coverage
Gap analysis
Suggested findings
Risk and roadmap impact
Report readiness sections
```

Supported Alpha framework structures:

```text
ISO/IEC 27001:2022
NIS2
NIST Cybersecurity Framework 2.0
CIS Controls v8
MITRE ATT&CK
HIPAA Security Rule
NSM Grunnprinsipper for IKT-sikkerhet
```

The Alpha engine intentionally uses original control summaries, assessment questions, evidence expectations, and mapping rationale. It does not copy full official control catalogues or certification material.

The UI uses the terms:

```text
Readiness
Coverage
Evidence completeness
Potential gap
Assessment result
```

It should not describe a result as certified, guaranteed, audit-proof, or fully compliant.

Framework content in this Alpha version is intended for workflow testing and assessment support. It should not be treated as a complete certification-grade control catalogue. Framework mappings are provided to support assessment consistency and reporting. They should be reviewed by a qualified professional before being used for formal audit or regulatory conclusions.

Audity supports professional judgment. It does not replace legal, regulatory, audit, or certification advice.



# Alpha Version Notice

Audity Alpha is intended for internal testing, workflow validation, and early feedback.

The Alpha version is not yet intended as a certification-grade audit platform or a replacement for professional legal, regulatory, or audit advice.

Known Alpha limitations:

```text
Framework mappings are initial and not complete certification catalogues.
PDF export uses browser print/save functionality.
Multi-user collaboration is not included.
Cloud sync is not included.
Role-based access control is not included.
Encryption for project files is planned for a later version.
The selected project folder must be opened again after a browser restart.
```

---

# Recommended Alpha Test Workflow

1. Start Audity locally.
2. Open the included test assessment.
3. Walk through the guided workflow.
4. Review the sample controls and findings.
5. Accept, edit, or dismiss suggested findings.
6. Review generated risks.
7. Review the remediation roadmap.
8. Open the report preview.
9. Export a project backup.
10. Re-import the backup and verify the assessment state.

## Compliance Engine Alpha Test Notes

Suggested manual checks for the current Alpha build:

```text
ISO 27001 Readiness:
Select ISO 27001 as Primary and NIS2 as Supporting.
Regenerate questions.
Set privileged MFA to No, score 1, evidence Missing.
Confirm access-control readiness drops and a framework-gap finding appears.

NIS2 Readiness:
Select NIS2 as Primary.
Mark incident response and restore testing as weak.
Confirm business continuity and incident handling gaps appear.
Confirm roadmap phases include 0-30 days and 31-90 days.

SOC / Detection Maturity:
Select MITRE ATT&CK as Supporting.
Answer logging and detection questions.
Confirm MITRE mappings appear as detection coverage support.
Confirm the UI avoids final compliance wording for MITRE.

Evidence Missing:
Set high-impact questions to score 1 and evidence Missing.
Confirm control status becomes Evidence missing or Not implemented.
Confirm suggested findings mention evidence gaps.

Export / Import:
Export .cisoassess after answering questions and accepting a framework gap.
Reset the selected project file.
Import the file.
Confirm selected frameworks, usage modes, questions, findings, risks, roadmap, and report sections still render.
```



# Project Status

```text
Status: Alpha
Architecture: Portable local web application
Execution model: Local web server + browser runtime
Storage model: File System Access API project folder + .cisoassess project file
Primary use case: Cybersecurity, audit, and GRC assessment workflow
```
