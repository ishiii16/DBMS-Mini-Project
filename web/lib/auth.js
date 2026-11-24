import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE, verify } from "./session";
import { query } from "./db";

export const getUser = async () => verify(cookies().get(COOKIE)?.value);
export const json = (data, status = 200) => NextResponse.json(data, { status });
export const err = (msg, status = 400) => json({ error: msg }, status);

// Parse a JSON body; malformed / empty / non-object bodies become {} instead of throwing
export async function body(req) {
  try { const b = await req.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : {}; }
  catch { return {}; }
}
// Coerce untrusted input to a trimmed string (objects/arrays → "")
export const str = (v) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

// Postgres error code → friendly 4xx response
function dbError(e) {
  switch (e.code) {
    case "23505": return err("Already exists", 409);                 // unique_violation
    case "23503": return err("Referenced item does not exist", 400); // foreign_key_violation
    case "23502": return err("A required value is missing or invalid", 400); // not_null_violation
    case "23514": return err("Value out of allowed range", 400);     // check_violation
    case "22001": return err("Value is too long", 400);              // string_data_right_truncation
    case "22003": return err("Number out of range", 400);            // numeric_value_out_of_range
    case "22P02": return err("Invalid input format", 400);           // invalid_text_representation
  }
  if (e.code?.startsWith("22") || e.code?.startsWith("23")) return err("Invalid input", 400);
  return null;
}

// Database privilege check (DCL enforcement): asks PostgreSQL whether this user's login role
// (mt_<username>, member of moodtune_admin / _listener / _restricted) holds `privilege` on `table`.
// Throws a 403 that guard() turns into a friendly error. Users without a mirror role are not restricted.
const ACTION = {
  feedback: { INSERT: "like or dislike songs", UPDATE: "change ratings", DELETE: "remove ratings" },
  listening_events: { INSERT: "log plays" },
  playlists: { INSERT: "create playlists", UPDATE: "rename playlists", DELETE: "delete playlists" },
  playlist_songs: { INSERT: "add songs to playlists", DELETE: "remove songs from playlists" },
};
export async function requirePriv(user, table, privilege) {
  const { rows: [r] } = await query(
    `SELECT has_table_privilege(db_role, $2, $3) AS ok, app_role FROM v_user_db_roles
     WHERE user_id = $1 AND db_role_exists`, [user.id, `public.${table}`, privilege]);
  if (r && !r.ok) {
    const e = new Error(r.app_role === "restricted"
      ? `🔒 Your account is read-only — you can browse and search, but you can't ${ACTION[table]?.[privilege] || `${privilege.toLowerCase()} ${table}`}.`
      : `Permission denied: your database role has no ${privilege} on ${table}.`);
    e.status = 403; e.dbDenied = { table, privilege };
    throw e;
  }
}

// Wrap a route handler: requires login (and optionally admin role); maps DB/input errors to 4xx
export function guard(handler, { admin = false } = {}) {
  return async (req, ctx) => {
    const user = await getUser();
    if (!user) return err("Not logged in", 401);
    if (admin) {
      // check the CURRENT role in the database, so a demotion takes effect without logging out
      const { rows: [u] } = await query("SELECT role FROM users WHERE user_id = $1", [user.id]);
      if (u?.role !== "admin") return err("Admins only", 403);
    }
    try { return await handler(req, ctx, user); }
    catch (e) {
      if (e.status === 403 && e.dbDenied) return json({ error: e.message, denied: e.dbDenied }, 403);
      if (e instanceof SyntaxError) return err("Malformed JSON body", 400);
      const mapped = dbError(e); if (mapped) return mapped;
      console.error(e); return err("Server error", 500);
    }
  };
}
// Parse a positive 32-bit integer id; anything else → null
export const int = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "object") return null;
  const n = Number(v);
  return Number.isInteger(n) && Math.abs(n) <= 2147483647 ? n : null;
};
