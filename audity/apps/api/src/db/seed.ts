import { createInstanceAdmin, getUserCount } from "../auth/service.js";
import { seedRolesAndPermissions } from "../rbac/seed.js";
import { verifyDatabaseConnection, pool } from "./client.js";
import { applyCoreSchema } from "./schema.js";

await verifyDatabaseConnection();
await applyCoreSchema();
await seedRolesAndPermissions();

if ((await getUserCount()) === 0) {
  await createInstanceAdmin({
    email: process.env.AUDITY_SEED_ADMIN_EMAIL ?? "admin@audity.local",
    name: "Instance Admin",
    password: process.env.AUDITY_SEED_ADMIN_PASSWORD ?? "change-me-now"
  });
  console.log("Seeded initial Instance Admin user.");
} else {
  console.log("Users already exist. Skipped initial admin seed.");
}

await pool.end();
console.log("Database seeded: roles and permissions are ready.");
