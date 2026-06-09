import type { AuthenticatedUser } from "../auth/hooks.js";
import { pool } from "../db/client.js";

export function isAdminRole(role?: string): boolean {
  return role === "Instance Admin" || role === "Tenant Admin";
}

export async function canAccessCustomer(user: AuthenticatedUser, customerId: string): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  const result = await pool.query<{ allowed: boolean }>(
    `select exists(
      select 1 from customers c
      where c.id = $1
        and c.archived_at is null
        and (
          c.created_by_user_id = $2
          or exists (
            select 1 from customer_shares cs
            where cs.customer_id = c.id
              and cs.shared_with_user_id = $2
              and cs.revoked_at is null
          )
        )
    ) as allowed`,
    [customerId, user.sub]
  );
  return result.rows[0]?.allowed === true;
}

export async function canManageCustomerAccess(user: AuthenticatedUser, customerId: string): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  const result = await pool.query<{ allowed: boolean }>(
    "select exists(select 1 from customers where id = $1 and created_by_user_id = $2 and archived_at is null) as allowed",
    [customerId, user.sub]
  );
  return result.rows[0]?.allowed === true;
}

export async function canAccessAssessment(user: AuthenticatedUser, assessmentId: string): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  const result = await pool.query<{ allowed: boolean }>(
    `select exists(
      select 1
      from assessments a
      join customers c on c.id = a.customer_id
      where a.id = $1
        and c.archived_at is null
        and (
          c.created_by_user_id = $2
          or exists (
            select 1 from customer_shares cs
            where cs.customer_id = c.id
              and cs.shared_with_user_id = $2
              and cs.revoked_at is null
          )
        )
    ) as allowed`,
    [assessmentId, user.sub]
  );
  return result.rows[0]?.allowed === true;
}

export async function customerAccessRecipients(customerId: string): Promise<string[]> {
  const result = await pool.query<{ user_id: string }>(
    `select created_by_user_id as user_id from customers where id = $1 and created_by_user_id is not null
     union
     select shared_with_user_id as user_id from customer_shares where customer_id = $1 and revoked_at is null`,
    [customerId]
  );
  return result.rows.map((row) => row.user_id);
}
