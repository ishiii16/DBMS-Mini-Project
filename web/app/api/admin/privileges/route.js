import { query, pool } from "@/lib/db";
import { guard, json, err, int, body, str } from "@/lib/auth";

// Admin-only: PostgreSQL Login/Group Roles for MoodTune (see db/05_privileges.sql)
//   GET                       -> group roles + members, login roles (one per user), privilege matrix per group
//   GET ?role=<db role>       -> privilege matrix for one role (e.g. a user's login role = their effective rights)
//   POST {action:"grant"|"revoke", role, object, privilege}  -> runs GRANT / REVOKE on a group role
//   POST {action:"test", userId, object, privilege}          -> SET ROLE to the user's login role and try it (EXPLAIN only, nothing changes)
//   POST {action:"reset"}                                    -> reset_default_privileges()
// Identifiers are never interpolated from the request: role, object and privilege must match a whitelist / the catalogue.

const GROUPS = ["moodtune_admin", "moodtune_listener", "moodtune_restricted"];
const PRIVS = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const qi = (id) => '"' + String(id).replace(/"/g, '""') + '"';

const objects = async () => (await query(
  `SELECT table_name AS name, CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END AS kind
   FROM information_schema.tables WHERE table_schema = 'public' AND table_type IN ('BASE TABLE','VIEW')`)).rows;
const matrix = async (role) => (await query("SELECT * FROM role_privileges($1)", [role])).rows;
const columnGrants = async (role) => (await query(
  `SELECT table_name, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columns
   FROM information_schema.column_privileges
   WHERE grantee = $1 AND table_schema = 'public'
     AND NOT has_table_privilege($1, format('%I.%I', table_schema, table_name), privilege_type)
   GROUP BY 1, 2`, [role])).rows;

export const GET = guard(async (req) => {
  const role = new URL(req.url).searchParams.get("role");
  if (role) {
    const ok = (await query("SELECT 1 FROM pg_roles WHERE rolname = $1 AND (rolname = ANY($2) OR rolname LIKE 'mt\\_%')", [role, GROUPS])).rowCount;
    if (!ok) return err("Unknown MoodTune role", 404);
    return json({ role, privileges: await matrix(role), columns: await columnGrants(role) });
  }
  const [groups, users] = await Promise.all([
    query(`SELECT r.rolname AS name, r.rolcanlogin AS can_login, shobj_description(r.oid, 'pg_authid') AS comment,
             ARRAY(SELECT m2.rolname::text FROM pg_auth_members m JOIN pg_roles m2 ON m2.oid = m.member
                   WHERE m.roleid = r.oid ORDER BY 1) AS members
           FROM pg_roles r WHERE r.rolname = ANY($1) ORDER BY r.rolname`, [GROUPS]),
    query("SELECT * FROM v_user_db_roles ORDER BY user_id"),
  ]);
  const byGroup = {};
  for (const g of GROUPS) byGroup[g] = { privileges: await matrix(g), columns: await columnGrants(g) };
  return json({ groups: groups.rows, users: users.rows, matrix: byGroup });
}, { admin: true });

export const POST = guard(async (req) => {
  const b = await body(req);
  const action = str(b.action);

  if (action === "reset") {
    await query("SELECT reset_default_privileges()");
    return json({ ok: true, sql: "SELECT reset_default_privileges();" });
  }

  const object = str(b.object), privilege = str(b.privilege).toUpperCase();
  const obj = (await objects()).find((o) => o.name === object);
  if (!obj) return err("Unknown table or view");
  if (!PRIVS.includes(privilege)) return err("Privilege must be SELECT, INSERT, UPDATE or DELETE");

  if (action === "grant" || action === "revoke") {
    const role = str(b.role);
    if (!GROUPS.includes(role)) return err("Privileges are managed on group roles only");
    if (obj.kind === "view" && privilege !== "SELECT") return err("Views only support SELECT here");
    const sql = action === "grant"
      ? `GRANT ${privilege} ON ${qi(object)} TO ${qi(role)};`
      : `REVOKE ${privilege} ON ${qi(object)} FROM ${qi(role)};`;
    await query(sql);
    const [after] = (await query("SELECT * FROM role_privileges($1) WHERE object_name = $2", [role, object])).rows;
    return json({ ok: true, sql, after });
  }

  if (action === "test") {
    const { rows: [u] } = await query("SELECT username, db_role, db_role_exists FROM v_user_db_roles WHERE user_id = $1", [int(b.userId)]);
    if (!u) return err("Unknown user", 404);
    if (!u.db_role_exists) return err("This user has no database role yet");
    if (obj.kind === "view" && privilege !== "SELECT") return err("Views can only be tested with SELECT");
    // A statement that needs exactly the chosen privilege. EXPLAIN makes PostgreSQL check permissions
    // without running it, and the whole thing is rolled back anyway.
    const t = qi(object);
    const stmt = {
      SELECT: `SELECT * FROM ${t} LIMIT 1`,
      INSERT: `EXPLAIN INSERT INTO ${t} DEFAULT VALUES`,
      UPDATE: `EXPLAIN UPDATE ${t} SET ${qi((await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position LIMIT 1", [object])).rows[0].column_name)} = DEFAULT`,
      DELETE: `EXPLAIN DELETE FROM ${t}`,
    }[privilege];
    const shown = `SET ROLE ${qi(u.db_role)};\n${stmt};`;
    let allowed, message;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${qi(u.db_role)}`);   // ends with the transaction
      try { await client.query(stmt); allowed = true; message = "Allowed by PostgreSQL"; }
      catch (e) {
        if (e.code !== "42501") throw e;                       // 42501 = insufficient_privilege
        allowed = false; message = `ERROR: ${e.message}`;
      }
    } finally {
      await client.query("ROLLBACK").catch(() => {});         // never keep anything
      client.release();
    }
    return json({ ok: true, username: u.username, role: u.db_role, sql: shown, allowed, message });
  }

  return err("Unknown action");
}, { admin: true });
