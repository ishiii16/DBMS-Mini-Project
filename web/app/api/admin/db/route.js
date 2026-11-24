import { query } from "@/lib/db";
import { guard, json, err, int } from "@/lib/auth";

// Admin-only, READ-ONLY database explorer.
//   GET /api/admin/db                -> every table & view in schema public, with live row counts + columns
//   GET /api/admin/db?name=songs     -> newest rows of that table/view (vector columns shown shortened)
// Table names are never taken from the request as SQL: the requested name must match an object
// returned by information_schema, and identifiers are double-quoted.

const qi = (id) => '"' + String(id).replace(/"/g, '""') + '"';

async function catalog() {
  const { rows: objs } = await query(`
    SELECT table_name AS name, CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END AS kind
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY kind, table_name`);
  const { rows: cols } = await query(`
    SELECT c.table_name, c.column_name, c.ordinal_position,
           CASE WHEN c.udt_name = 'vector' THEN 'vector' ELSE c.data_type END AS type,
           EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage k
                     ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                   WHERE tc.table_schema = 'public' AND tc.table_name = c.table_name
                     AND tc.constraint_type = 'PRIMARY KEY' AND k.column_name = c.column_name) AS pk,
           EXISTS (SELECT 1 FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage k
                     ON k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema
                   WHERE tc.table_schema = 'public' AND tc.table_name = c.table_name
                     AND tc.constraint_type = 'FOREIGN KEY' AND k.column_name = c.column_name) AS fk
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position`);
  const byTable = {};
  for (const c of cols) (byTable[c.table_name] ||= []).push({ name: c.column_name, type: c.type, pk: c.pk, fk: c.fk });
  return objs.map((o) => ({ ...o, columns: byTable[o.name] || [] }));
}

export const GET = guard(async (req) => {
  const p = new URL(req.url).searchParams;
  const objs = await catalog();
  const name = p.get("name");

  if (!name) {
    // live row counts (exact) for every table and view, in one round trip
    const sql = objs.map((o, i) => `SELECT ${i} AS i, COUNT(*)::int AS n FROM ${qi(o.name)}`).join(" UNION ALL ");
    const { rows } = objs.length ? await query(sql) : { rows: [] };
    const counts = Object.fromEntries(rows.map((r) => [r.i, r.n]));
    const { rows: [db] } = await query(`SELECT current_database() AS database, split_part(version(), ' on ', 1) AS server,
      (SELECT string_agg(extname || ' ' || extversion, ', ' ORDER BY extname) FROM pg_extension WHERE extname <> 'plpgsql') AS extensions`);
    return json({ ...db, objects: objs.map((o, i) => ({ name: o.name, kind: o.kind, rows: counts[i] ?? 0, columns: o.columns })) });
  }

  const obj = objs.find((o) => o.name === name);
  if (!obj) return err("Unknown table or view", 404);
  const limit = Math.min(Math.max(int(p.get("limit")) || 50, 1), 200);

  // Vector columns: show dimensions + first numbers instead of 384 values
  const select = obj.columns.map((c) => c.type === "vector"
    ? `CASE WHEN ${qi(c.name)} IS NULL THEN NULL ELSE 'vector(' || vector_dims(${qi(c.name)}) || ') ' || left(${qi(c.name)}::text, 42) || ' …' END AS ${qi(c.name)}`
    : c.type === "tsvector" ? `left(${qi(c.name)}::text, 60) AS ${qi(c.name)}`
    : qi(c.name)).join(", ");
  const pk = obj.columns.filter((c) => c.pk).map((c) => qi(c.name));
  const order = pk.length ? pk.map((c) => `${c} DESC`).join(", ") : "1 DESC";
  const { rows } = await query(`SELECT ${select} FROM ${qi(obj.name)} ORDER BY ${order} LIMIT ${limit}`);
  return json({ name: obj.name, kind: obj.kind, columns: obj.columns, key: obj.columns.filter((c) => c.pk).map((c) => c.name), rows });
}, { admin: true });
