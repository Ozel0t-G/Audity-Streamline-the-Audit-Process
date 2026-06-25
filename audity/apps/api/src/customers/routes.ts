import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { appendAuditEvent } from "../audit/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";
import { createNotification } from "../notifications/service.js";
import { customerHasActiveLegalHold } from "../productivity/legalHolds.js";
import { isUuid, validateBody } from "../utils/validation.js";
import { canAccessCustomer, canManageCustomerAccess, canViewCustomerIncludingArchived, customerAccessRecipients, isAdminRole } from "./access.js";

type CustomerBody = {
  name?: string;
  industry?: string;
  regulatoryContext?: string;
  criticalSystems?: string[];
  businessCriticality?: string;
  status?: string;
  frameworkIds?: string[];
  address?: string;
  website?: string;
  notes?: string;
};

const postgresUuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const customerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  industry: z.string().optional(),
  regulatoryContext: z.string().optional(),
  criticalSystems: z.array(z.string()).optional(),
  businessCriticality: z.string().optional(),
  status: z.string().optional(),
  frameworkIds: z.array(postgresUuidSchema).optional(),
  address: z.string().max(500).optional(),
  website: z.string().max(300).optional(),
  notes: z.string().max(5000).optional()
});

type ContactBody = {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  isPrimary?: boolean;
  notes?: string;
};

const contactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  role: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().max(2000).optional()
});

type CustomerContactRow = {
  id: string;
  customer_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapContact(row: CustomerContactRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    name: row.name,
    role: row.role ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    isPrimary: row.is_primary,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const shareSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().max(1000).optional()
});

const frameworkScopeSchema = z.object({
  frameworkIds: z.array(postgresUuidSchema)
});

function mapCustomer(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    regulatoryContext: row.regulatory_context,
    criticalSystems: row.critical_systems,
    businessCriticality: row.business_criticality,
    status: row.status,
    address: row.address ?? null,
    website: row.website ?? null,
    notes: row.notes ?? null,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    createdByEmail: row.created_by_email,
    sharedWith: row.shared_with ?? [],
    selectedFrameworks: row.selected_frameworks ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    archiveReason: row.archive_reason ?? null
  };
}

function customerSelect(where: string) {
  return `
    select c.*,
      creator.name as created_by_name,
      creator.email as created_by_email,
      coalesce(
        json_agg(distinct jsonb_build_object('id', su.id, 'name', su.name, 'email', su.email))
          filter (where su.id is not null),
        '[]'::json
      ) as shared_with,
      coalesce(
        json_agg(distinct jsonb_build_object('id', f.id, 'name', f.name, 'shortName', f.short_name))
          filter (where f.id is not null),
        '[]'::json
      ) as selected_frameworks
    from customers c
    left join users creator on creator.id = c.created_by_user_id
    left join customer_shares cs on cs.customer_id = c.id and cs.revoked_at is null
    left join users su on su.id = cs.shared_with_user_id
    left join customer_frameworks cf on cf.customer_id = c.id
    left join frameworks f on f.id = cf.framework_id
    ${where}
    group by c.id, creator.id
  `;
}

async function loadCustomer(id: string) {
  if (!isUuid(id)) return null;
  const result = await pool.query(`${customerSelect("where c.id = $1 and c.archived_at is null")}`, [id]);
  return result.rows[0] ? mapCustomer(result.rows[0]) : null;
}

async function loadCustomerIncludingArchived(id: string) {
  if (!isUuid(id)) return null;
  const result = await pool.query(`${customerSelect("where c.id = $1")}`, [id]);
  return result.rows[0] ? mapCustomer(result.rows[0]) : null;
}

async function saveCustomerFrameworks(customerId: string, frameworkIds: string[], userId: string): Promise<number> {
  const before = await pool.query<{ framework_id: string }>(
    "select framework_id::text from customer_frameworks where customer_id = $1",
    [customerId]
  );
  const beforeSet = new Set(before.rows.map((row) => row.framework_id));
  const nextSet = new Set(frameworkIds);
  await pool.query("delete from customer_frameworks where customer_id = $1 and not (framework_id = any($2::uuid[]))", [
    customerId,
    frameworkIds
  ]);
  for (const frameworkId of frameworkIds) {
    await pool.query(
      `insert into customer_frameworks (customer_id, framework_id, selected_by_user_id)
       values ($1, $2, $3)
       on conflict (customer_id, framework_id) do nothing`,
      [customerId, frameworkId, userId]
    );
  }
  return [...nextSet].filter((id) => !beforeSet.has(id)).length;
}

async function notifyScopeChange(customerId: string, actorUserId: string, addedCount: number): Promise<void> {
  const customer = await loadCustomer(customerId);
  if (!customer) return;
  const recipients = (await customerAccessRecipients(customerId)).filter((id) => id !== actorUserId);
  for (const recipientUserId of recipients) {
    await createNotification({
      recipientUserId,
      type: "customer_scope_changed",
      title: "Customer scope changed",
      message: `The framework scope for ${customer.name} was changed.`,
      entityType: "customer",
      entityId: customerId,
      customerId,
      createdByUserId: actorUserId
    });
    if (addedCount > 0) {
      await createNotification({
        recipientUserId,
        type: "new_questions_available",
        title: "New questions available",
        message: `New questions are available for ${customer.name} because the framework scope was updated.`,
        entityType: "customer",
        entityId: customerId,
        customerId,
        createdByUserId: actorUserId
      });
    }
  }
}

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { search?: string } }>(
    "/api/users/share-targets",
    { preHandler: requirePermission("assessment.view") },
    async (request) => {
      // Escape ILIKE wildcards in user input so a search for "a_b" doesn't
      // match "aXb" because of a literal underscore being treated as a wildcard.
      const rawSearch = (request.query.search ?? "").trim().replace(/[\\%_]/g, "\\$&");
      const search = `%${rawSearch}%`;
      const result = await pool.query(
        `select u.id, u.name, u.email, r.name as role, u.status
         from users u
         join roles r on r.id = u.role_id
         where u.status <> 'disabled'
           and u.id <> $1
           and ($2 = '%%' or u.name ilike $2 or u.email ilike $2)
         order by u.created_at desc, u.name, u.email
         limit 100`,
        [request.user!.sub, search]
      );
      return { users: result.rows };
    }
  );

  app.get("/api/customers", { preHandler: requirePermission("assessment.view") }, async (request) => {
    const admin = isAdminRole(request.user!.role);
    const result = await pool.query(
      `${customerSelect(
        admin
          ? "where c.archived_at is null"
          : `where c.archived_at is null and (
              c.created_by_user_id = $1
              or exists (
                select 1 from customer_shares mine
                where mine.customer_id = c.id and mine.shared_with_user_id = $1 and mine.revoked_at is null
              )
            )`
      )}
       order by c.created_at desc`,
      admin ? [] : [request.user!.sub]
    );
    return { customers: result.rows.map(mapCustomer) };
  });

  app.get("/api/customers/my", { preHandler: requirePermission("assessment.view") }, async (request) => {
    const admin = isAdminRole(request.user!.role);
    const result = await pool.query(
      `${customerSelect(admin ? "where c.archived_at is null" : "where c.archived_at is null and c.created_by_user_id = $1")}
       order by c.created_at desc`,
      admin ? [] : [request.user!.sub]
    );
    return { customers: result.rows.map(mapCustomer) };
  });

  app.get("/api/customers/shared", { preHandler: requirePermission("assessment.view") }, async (request) => {
    const result = await pool.query(
      `${customerSelect(`where c.archived_at is null and exists (
        select 1 from customer_shares mine
        where mine.customer_id = c.id and mine.shared_with_user_id = $1 and mine.revoked_at is null
      ) and c.created_by_user_id <> $1`)}
       order by c.created_at desc`,
      [request.user!.sub]
    );
    return { customers: result.rows.map(mapCustomer) };
  });

  app.post<{ Body: CustomerBody }>(
    "/api/customers",
    { preHandler: requireCsrfPermission("assessment.create") },
    async (request, reply) => {
      const body = validateBody(customerSchema.required({ name: true }), request.body, reply);
      if (!body) return;
      const id = randomUUID();
      const result = await pool.query(
        `insert into customers
          (id, name, created_by_user_id, industry, regulatory_context, critical_systems, business_criticality, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning *`,
        [
          id,
          body.name,
          request.user!.sub,
          body.industry ?? null,
          body.regulatoryContext ?? null,
          JSON.stringify(body.criticalSystems ?? []),
          body.businessCriticality ?? null,
          body.status ?? "active"
        ]
      );
      if (body.frameworkIds?.length) {
        await saveCustomerFrameworks(id, body.frameworkIds, request.user!.sub);
      }
      const customer = (await loadCustomer(id)) ?? mapCustomer(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.created",
        entityType: "customer",
        entityId: id,
        before: null,
        after: customer
      });
      return reply.code(201).send({ customer });
    }
  );

  app.post(
    "/api/customers/bulk-import",
    { preHandler: requireCsrfPermission("assessment.create") },
    async (request, reply) => {
      const bulkSchema = z.object({
        customers: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              industry: z.string().max(80).optional(),
              regulatoryContext: z.string().max(120).optional(),
              criticalSystems: z.array(z.string().max(80)).max(20).optional(),
              businessCriticality: z.string().max(40).optional(),
              status: z.string().max(40).optional()
            })
          )
          .min(1)
          .max(500)
      });
      const body = validateBody(bulkSchema, request.body, reply);
      if (!body) return;
      const created: Array<Record<string, unknown>> = [];
      const failures: Array<{ name: string; reason: string }> = [];
      for (const row of body.customers) {
        const id = randomUUID();
        try {
          await pool.query(
            `insert into customers
              (id, name, created_by_user_id, industry, regulatory_context, critical_systems, business_criticality, status)
             values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              id,
              row.name,
              request.user!.sub,
              row.industry ?? null,
              row.regulatoryContext ?? null,
              JSON.stringify(row.criticalSystems ?? []),
              row.businessCriticality ?? null,
              row.status ?? "active"
            ]
          );
        } catch (error) {
          failures.push({
            name: row.name,
            reason: error instanceof Error ? error.message : "Insert failed"
          });
          continue;
        }
        const customer = await loadCustomer(id).catch(() => null);
        if (customer) {
          created.push(customer);
          await appendActivityEvent({
            userId: request.user!.sub,
            action: "customer.bulk_imported",
            entityType: "customer",
            entityId: id,
            before: null,
            after: customer
          }).catch(() => undefined);
        }
      }
      return reply.code(201).send({ created, failures });
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/customers/:id",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      // Owners and admins may also fetch archived customers (read-only view).
      if (!(await canViewCustomerIncludingArchived(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const customer = await loadCustomerIncludingArchived(request.params.id);
      if (!customer) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      return { customer };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/access",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const customer = await loadCustomer(request.params.id);
      return { access: { createdBy: { id: customer?.createdByUserId, name: customer?.createdByName, email: customer?.createdByEmail }, sharedWith: customer?.sharedWith ?? [] } };
    }
  );

  app.put<{ Params: { id: string }; Body: CustomerBody }>(
    "/api/customers/:id",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const body = validateBody(customerSchema, request.body, reply);
      if (!body) return;
      const before = await loadCustomer(request.params.id);
      const result = await pool.query(
        `update customers
         set name = coalesce($2, name),
             industry = $3,
             regulatory_context = $4,
             critical_systems = $5,
             business_criticality = $6,
             status = coalesce($7, status),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.id,
          body.name,
          body.industry ?? null,
          body.regulatoryContext ?? null,
          JSON.stringify(body.criticalSystems ?? []),
          body.businessCriticality ?? null,
          body.status
        ]
      );
      const customer = mapCustomer(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.updated",
        entityType: "customer",
        entityId: request.params.id,
        before,
        after: customer
      });
      return { customer };
    }
  );

  app.patch<{ Params: { id: string }; Body: CustomerBody }>(
    "/api/customers/:id",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const body = validateBody(customerSchema, request.body, reply);
      if (!body) return;
      const before = await loadCustomer(request.params.id);
      const current = await pool.query(
        "select industry, regulatory_context, critical_systems, business_criticality, status, address, website, notes from customers where id = $1",
        [request.params.id]
      );
      const result = await pool.query(
        `update customers
         set name = coalesce($2, name),
             industry = coalesce($3, industry),
             regulatory_context = coalesce($4, regulatory_context),
             critical_systems = coalesce($5, critical_systems),
             business_criticality = coalesce($6, business_criticality),
             status = coalesce($7, status),
             address = coalesce($8, address),
             website = coalesce($9, website),
             notes = coalesce($10, notes),
             updated_at = now()
         where id = $1
         returning *`,
        [
          request.params.id,
          body.name,
          body.industry ?? current.rows[0]?.industry,
          body.regulatoryContext ?? current.rows[0]?.regulatory_context,
          body.criticalSystems ? JSON.stringify(body.criticalSystems) : JSON.stringify(current.rows[0]?.critical_systems ?? []),
          body.businessCriticality ?? current.rows[0]?.business_criticality,
          body.status,
          body.address ?? current.rows[0]?.address ?? null,
          body.website ?? current.rows[0]?.website ?? null,
          body.notes ?? current.rows[0]?.notes ?? null
        ]
      );
      const customer = mapCustomer(result.rows[0]);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.updated",
        entityType: "customer",
        entityId: request.params.id,
        before,
        after: customer
      });
      return { customer };
    }
  );

  app.post<{ Params: { id: string }; Body: { userId: string; message?: string } }>(
    "/api/customers/:id/share",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const body = validateBody(shareSchema, request.body, reply);
      if (!body) return;
      if (!(await canManageCustomerAccess(request.user!, request.params.id))) {
        return reply.code(403).send({ code: "CUSTOMER_SHARE_FORBIDDEN", message: "Only the customer creator or Admin can share this customer" });
      }
      if (body.userId === request.user!.sub) {
        return reply.code(400).send({ code: "INVALID_SHARE_TARGET", message: "The current user cannot be selected" });
      }
      const target = await pool.query("select id, name, email from users where id = $1 and status <> 'disabled'", [body.userId]);
      if (!target.rows[0]) {
        return reply.code(400).send({ code: "USER_NOT_FOUND", message: "Only non-disabled users can be selected" });
      }
      const shareId = randomUUID();
      try {
        await pool.query(
          `insert into customer_shares (id, customer_id, shared_with_user_id, shared_by_user_id, message)
           values ($1, $2, $3, $4, $5)`,
          [shareId, request.params.id, body.userId, request.user!.sub, body.message ?? null]
        );
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          return reply.code(409).send({ code: "CUSTOMER_ALREADY_SHARED", message: "This customer is already shared with this user." });
        }
        throw err;
      }
      const customer = await loadCustomer(request.params.id);
      await createNotification({
        recipientUserId: body.userId,
        type: "customer_shared",
        title: "Customer shared with you",
        message: `You were invited to work on ${customer?.name ?? "this customer"}.${body.message ? ` Message from ${request.user!.email}: ${body.message}` : ""}`,
        entityType: "customer",
        entityId: request.params.id,
        customerId: request.params.id,
        createdByUserId: request.user!.sub
      });
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.shared",
        entityType: "customer",
        entityId: request.params.id,
        before: null,
        after: { sharedWithUserId: body.userId }
      });
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "customer.shared",
        entity: "customer",
        entityId: request.params.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        payload: { sharedWithUserId: body.userId }
      });
      return reply.code(201).send({ status: "ok" });
    }
  );

  app.patch<{ Params: { id: string }; Body: { frameworkIds: string[] } }>(
    "/api/customers/:id/frameworks",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const body = validateBody(frameworkScopeSchema, request.body, reply);
      if (!body) return;
      if (!(await canManageCustomerAccess(request.user!, request.params.id))) {
        return reply.code(403).send({ code: "FRAMEWORK_SCOPE_FORBIDDEN", message: "Only the customer creator or Admin can change framework scope" });
      }
      const before = await pool.query<{ framework_id: string }>("select framework_id::text from customer_frameworks where customer_id = $1", [request.params.id]);
      const addedCount = await saveCustomerFrameworks(request.params.id, body.frameworkIds, request.user!.sub);
      await notifyScopeChange(request.params.id, request.user!.sub, addedCount);
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.framework_scope.updated",
        entityType: "customer",
        entityId: request.params.id,
        before: before.rows.map((row) => row.framework_id),
        after: body.frameworkIds
      });
      if (addedCount > 0) {
        await appendActivityEvent({
          userId: request.user!.sub,
          action: "question_catalog.updated",
          entityType: "customer",
          entityId: request.params.id,
          before: before.rows.map((row) => row.framework_id),
          after: body.frameworkIds
        });
      }
      await appendAuditEvent({
        actor: request.user!.sub,
        action: "customer.framework_scope.updated",
        entity: "customer",
        entityId: request.params.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        payload: {
          before: before.rows.map((row) => row.framework_id),
          after: body.frameworkIds
        }
      });
      return { customer: await loadCustomer(request.params.id) };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/questions",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const result = await pool.query(
        `select f.id as framework_id, f.name as framework_name, f.short_name,
          fd.name as domain_name, fc.id as control_id, fc.control_code, fc.title,
          qcm.question_id, qcm.question
         from customer_frameworks cf
         join frameworks f on f.id = cf.framework_id
         join framework_domains fd on fd.framework_id = f.id
         join framework_controls fc on fc.framework_domain_id = fd.id
         join question_control_mappings qcm on qcm.framework_control_id = fc.id
         where cf.customer_id = $1
         order by f.name, fd.sort_order, qcm.sort_order`,
        [request.params.id]
      );
      if (!result.rows.length) {
        return { message: "No framework selected. Please select at least one framework to generate the question catalog.", questions: [] };
      }
      return { questions: result.rows };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/customers/:id",
    { preHandler: requireCsrfPermission("assessment.delete") },
    async (request, reply) => {
      if (!(await canManageCustomerAccess(request.user!, request.params.id))) {
        return reply.code(403).send({ code: "CUSTOMER_DELETE_FORBIDDEN", message: "Only the customer creator or Admin can delete this customer" });
      }
      if (await customerHasActiveLegalHold(request.params.id)) {
        return reply.code(409).send({
          code: "LEGAL_HOLD_ACTIVE",
          message: "This customer (or one of its assessments) is under an active legal hold and cannot be deleted. Release the hold first."
        });
      }
      const before = await loadCustomer(request.params.id);
      // email_delivery_log (.assessment_id/.report_id) and the archive tables reference
      // the customer / its assessments+reports WITHOUT on-delete-cascade, so the plain
      // cascade delete used to fail (a customer that ever had a report emailed, or was
      // archived, could not be deleted — FK violation → 500). Clean those up first, in one
      // transaction: null the email-log refs (keep the compliance record) and drop the
      // archive metadata, then delete the customer (which cascades the rest).
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `update email_delivery_log
              set assessment_id = null, report_id = null
            where assessment_id in (select id from assessments where customer_id = $1)`,
          [request.params.id]
        );
        await client.query("delete from archive_restore_requests where customer_id = $1", [request.params.id]);
        await client.query("delete from archive_index where customer_id = $1", [request.params.id]);
        await client.query("delete from customers where id = $1", [request.params.id]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.deleted",
        entityType: "customer",
        entityId: request.params.id,
        before,
        after: null
      });
      return { status: "ok" };
    }
  );

  // ─── Customer contacts (structured, multiple per customer) ──────────────
  app.get<{ Params: { id: string } }>(
    "/api/customers/:id/contacts",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const result = await pool.query(
        `select * from customer_contacts where customer_id = $1
         order by is_primary desc, name asc`,
        [request.params.id]
      );
      return { contacts: result.rows.map(mapContact) };
    }
  );

  app.post<{ Params: { id: string }; Body: ContactBody }>(
    "/api/customers/:id/contacts",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const body = validateBody(contactSchema.required({ name: true }), request.body, reply);
      if (!body) return;
      const contactId = randomUUID();
      const result = await pool.query(
        `insert into customer_contacts (id, customer_id, name, role, email, phone, is_primary, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [
          contactId,
          request.params.id,
          body.name,
          body.role ?? null,
          body.email ?? null,
          body.phone ?? null,
          body.isPrimary ?? false,
          body.notes ?? null
        ]
      );
      await appendActivityEvent({
        userId: request.user!.sub,
        action: "customer.contact.created",
        entityType: "customer",
        entityId: request.params.id,
        before: null,
        after: { contactId, name: body.name }
      });
      return reply.code(201).send({ contact: mapContact(result.rows[0]) });
    }
  );

  app.patch<{ Params: { id: string; contactId: string }; Body: ContactBody }>(
    "/api/customers/:id/contacts/:contactId",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const body = validateBody(contactSchema, request.body, reply);
      if (!body) return;
      const result = await pool.query(
        `update customer_contacts
         set name = coalesce($3, name),
             role = coalesce($4, role),
             email = coalesce($5, email),
             phone = coalesce($6, phone),
             is_primary = coalesce($7, is_primary),
             notes = coalesce($8, notes),
             updated_at = now()
         where id = $1 and customer_id = $2
         returning *`,
        [
          request.params.contactId,
          request.params.id,
          body.name ?? null,
          body.role ?? null,
          body.email ?? null,
          body.phone ?? null,
          body.isPrimary ?? null,
          body.notes ?? null
        ]
      );
      if (!result.rows[0]) {
        return reply.code(404).send({ code: "CONTACT_NOT_FOUND", message: "Contact not found" });
      }
      return { contact: mapContact(result.rows[0]) };
    }
  );

  app.delete<{ Params: { id: string; contactId: string } }>(
    "/api/customers/:id/contacts/:contactId",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      if (!(await canAccessCustomer(request.user!, request.params.id))) {
        return reply.code(404).send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      const result = await pool.query(
        "delete from customer_contacts where id = $1 and customer_id = $2",
        [request.params.contactId, request.params.id]
      );
      if (!result.rowCount) {
        return reply.code(404).send({ code: "CONTACT_NOT_FOUND", message: "Contact not found" });
      }
      return { status: "ok" };
    }
  );
}
