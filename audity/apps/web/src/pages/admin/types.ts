export type ActivityLog = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  prevHash: string | null;
  eventHash: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  payload: unknown;
  createdAt: string;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RoleOption = {
  id: string;
  name: string;
  permissions?: string[];
};

export type PermissionOption = {
  id: string;
  name: string;
};
