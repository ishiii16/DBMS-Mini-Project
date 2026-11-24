import { Pool } from "pg";
export const pool = globalThis._pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });
globalThis._pgPool = pool;

// All queries are parameterized ($1, $2 ...) -> no SQL injection
export const query = (text, params) => pool.query(text, params);

// Run fn(client) inside BEGIN/COMMIT; ROLLBACK on any error (all-or-nothing)
export async function tx(fn) {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await fn(c); await c.query("COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
