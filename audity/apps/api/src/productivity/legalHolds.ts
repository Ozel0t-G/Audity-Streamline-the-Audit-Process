import { pool } from "../db/client.js";

/** Minimal query interface satisfied by both the pool and a transaction client. */
type Queryable = { query: typeof pool.query };

/**
 * Returns true if the customer (or any of its assessments) is under an active,
 * non-expired legal hold. Used to block deletion/archival of data that compliance
 * has frozen — the `legal_holds` table was previously created/listed but never
 * enforced anywhere.
 */
export async function customerHasActiveLegalHold(
  customerId: string,
  executor: Queryable = pool
): Promise<boolean> {
  const result = await executor.query<{ exists: boolean }>(
    `select exists (
        select 1
          from legal_holds
         where status = 'active'
           and (expires_at is null or expires_at >= current_date)
           and (
             customer_id = $1
             or assessment_id in (select id from assessments where customer_id = $1)
           )
     ) as exists`,
    [customerId]
  );
  return result.rows[0]?.exists ?? false;
}
