import { randomUUID } from "node:crypto";
import { pool } from "../db/client.js";
import { permissions, rolePermissions, roles } from "./permissions.js";

export async function seedRolesAndPermissions(): Promise<void> {
  const roleIds = new Map<string, string>();
  const permissionIds = new Map<string, string>();

  for (const role of roles) {
    const result = await pool.query<{ id: string }>(
      `insert into roles (id, name, description)
       values ($1, $2, $3)
       on conflict (name) do update set description = excluded.description
       returning id`,
      [randomUUID(), role, `${role} role`]
    );
    roleIds.set(role, result.rows[0].id);
  }

  for (const permission of permissions) {
    const result = await pool.query<{ id: string }>(
      `insert into permissions (id, name, description)
       values ($1, $2, $3)
       on conflict (name) do update set description = excluded.description
       returning id`,
      [randomUUID(), permission, `${permission} permission`]
    );
    permissionIds.set(permission, result.rows[0].id);
  }

  for (const [role, assignedPermissions] of Object.entries(rolePermissions)) {
    await pool.query(
      `delete from role_permissions
       where role_id = $1
         and permission_id <> all($2::uuid[])`,
      [
        roleIds.get(role),
        assignedPermissions.map((permission) => permissionIds.get(permission))
      ]
    );
    for (const permission of assignedPermissions) {
      await pool.query(
        `insert into role_permissions (role_id, permission_id)
         values ($1, $2)
         on conflict do nothing`,
        [roleIds.get(role), permissionIds.get(permission)]
      );
    }
  }
}
