export const roles = [
  "Instance Admin",
  "Tenant Admin",
  "Assessment Manager",
  "Auditor",
  "Contributor",
  "Reviewer",
  "Viewer"
] as const;

export const permissions = [
  "users.invite",
  "users.disable",
  "roles.manage",
  "assessment.create",
  "assessment.edit",
  "assessment.delete",
  "assessment.view",
  "finding.create",
  "finding.approve",
  "risk.edit",
  "risk.accept",
  "roadmap.edit",
  "report.export",
  "report.send",
  "evidence.upload",
  "evidence.download",
  "auditlog.view",
  "activitylog.view",
  "settings.manage",
  "branding.manage",
  "email.manage",
  "frameworks.manage",
  "backup.manage"
] as const;

export type PermissionName = (typeof permissions)[number];

export const rolePermissions: Record<(typeof roles)[number], PermissionName[]> = {
  "Instance Admin": [...permissions],
  "Tenant Admin": permissions.filter((permission) => !["settings.manage", "frameworks.manage"].includes(permission)),
  "Assessment Manager": [
    "assessment.create",
    "assessment.edit",
    "assessment.view",
    "finding.create",
    "finding.approve",
    "risk.edit",
    "risk.accept",
    "roadmap.edit",
    "report.export",
    "report.send",
    "evidence.upload",
    "evidence.download",
    "activitylog.view"
  ],
  Auditor: [
    "assessment.create",
    "assessment.edit",
    "assessment.view",
    "finding.create",
    "finding.approve",
    "risk.edit",
    "roadmap.edit",
    "report.export",
    "report.send",
    "evidence.upload",
    "evidence.download"
  ],
  Contributor: [
    "assessment.edit",
    "assessment.view",
    "finding.create",
    "risk.edit",
    "roadmap.edit",
    "evidence.upload",
    "evidence.download"
  ],
  Reviewer: ["assessment.view", "finding.approve", "risk.accept", "evidence.download"],
  Viewer: ["assessment.view", "evidence.download"]
};
