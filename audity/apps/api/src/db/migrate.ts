import { verifyDatabaseConnection, pool } from "./client.js";
import { applyCoreSchema } from "./schema.js";

await verifyDatabaseConnection();
await applyCoreSchema();
await pool.end();
console.log("Database migrated: core Step 2 schema is ready.");
