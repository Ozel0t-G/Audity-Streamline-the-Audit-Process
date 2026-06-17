export type PermissionGate = "edit" | "approve" | "report" | "comment" | "delete";

const REASONS: Record<PermissionGate, string> = {
  edit: "You need editor permission on this assessment to make changes.",
  approve: "Only approvers can complete this action — ask an auditor lead to sign off.",
  report: "You need report permission to generate or export reports for this assessment.",
  comment: "You need comment permission on this assessment.",
  delete: "You need delete permission for this resource."
};

export function permissionReason(gate: PermissionGate): string {
  return REASONS[gate];
}

export function disabledTitle(allowed: boolean, gate: PermissionGate): string | undefined {
  return allowed ? undefined : permissionReason(gate);
}
