import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required to extend Env
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}

// reversal_of_id is ON DELETE RESTRICT, so a chain of reversals is removed from its end.
const DELETE_UNREFERENCED_TRANSACTIONS = `
  DELETE FROM inventory_transactions
  WHERE id NOT IN (
    SELECT reversal_of_id FROM inventory_transactions WHERE reversal_of_id IS NOT NULL
  )`;

const DELETE_STATEMENTS = [
  "DELETE FROM inventory_transaction_items",
  DELETE_UNREFERENCED_TRANSACTIONS,
  DELETE_UNREFERENCED_TRANSACTIONS,
  DELETE_UNREFERENCED_TRANSACTIONS,
  "DELETE FROM products",
  "DELETE FROM product_categories",
  "DELETE FROM customer_notes",
  "DELETE FROM customers",
  "DELETE FROM employees",
  "DELETE FROM company_settings",
  "DELETE FROM audit_logs",
  "DELETE FROM admin_sessions",
  "DELETE FROM admin_users",
  "DELETE FROM auth_rate_limits",
];

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

beforeEach(resetDatabase);

// The ledger triggers forbid deleting confirmed rows, so they are lifted during cleanup.
async function resetDatabase() {
  const { results } = await env.DB.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'",
  ).all<{ name: string; sql: string }>();

  await env.DB.batch([
    ...results.map((trigger) => env.DB.prepare(`DROP TRIGGER ${trigger.name}`)),
    ...DELETE_STATEMENTS.map((statement) => env.DB.prepare(statement)),
    ...results.map((trigger) => env.DB.prepare(trigger.sql)),
  ]);
}
