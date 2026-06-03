import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendActivityEvent } from "../activity/service.js";
import { requireCsrfPermission, requirePermission } from "../auth/hooks.js";
import { pool } from "../db/client.js";
import { validateBody } from "../utils/validation.js";

type CustomerBody = {
  name?: string;
  industry?: string;
  regulatoryContext?: string;
  criticalSystems?: string[];
  businessCriticality?: string;
  status?: string;
};

const customerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  industry: z.string().optional(),
  regulatoryContext: z.string().optional(),
  criticalSystems: z.array(z.string()).optional(),
  businessCriticality: z.string().optional(),
  status: z.string().optional()
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadCustomer(id: string) {
  const result = await pool.query("select * from customers where id = $1", [id]);
  return result.rows[0] ? mapCustomer(result.rows[0]) : null;
}

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/customers",
    { preHandler: requirePermission("assessment.view") },
    async () => {
      const result = await pool.query(
        "select * from customers order by created_at desc"
      );
      return { customers: result.rows.map(mapCustomer) };
    }
  );

  app.post<{ Body: CustomerBody }>(
    "/api/customers",
    { preHandler: requireCsrfPermission("assessment.create") },
    async (request, reply) => {
      const body = validateBody(customerSchema.required({ name: true }), request.body, reply);
      if (!body) return;
      if (!body.name) {
        return reply
          .code(400)
          .send({ code: "INVALID_INPUT", message: "Customer name is required" });
      }
      const id = randomUUID();
      const result = await pool.query(
        `insert into customers
          (id, name, industry, regulatory_context, critical_systems, business_criticality, status)
         values ($1, $2, $3, $4, $5, $6, $7)
         returning *`,
        [
          id,
          body.name,
          body.industry ?? null,
          body.regulatoryContext ?? null,
          JSON.stringify(body.criticalSystems ?? []),
          body.businessCriticality ?? null,
          body.status ?? "active"
        ]
      );
      const customer = mapCustomer(result.rows[0]);
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

  app.get<{ Params: { id: string } }>(
    "/api/customers/:id",
    { preHandler: requirePermission("assessment.view") },
    async (request, reply) => {
      const customer = await loadCustomer(request.params.id);
      if (!customer) {
        return reply
          .code(404)
          .send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      return { customer };
    }
  );

  app.put<{ Params: { id: string }; Body: CustomerBody }>(
    "/api/customers/:id",
    { preHandler: requireCsrfPermission("assessment.edit") },
    async (request, reply) => {
      const body = validateBody(customerSchema, request.body, reply);
      if (!body) return;
      const before = await loadCustomer(request.params.id);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
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

  app.delete<{ Params: { id: string } }>(
    "/api/customers/:id",
    { preHandler: requireCsrfPermission("assessment.delete") },
    async (request, reply) => {
      const before = await loadCustomer(request.params.id);
      if (!before) {
        return reply
          .code(404)
          .send({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
      }
      await pool.query("delete from customers where id = $1", [request.params.id]);
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
}
