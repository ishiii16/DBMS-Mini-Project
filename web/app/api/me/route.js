import { getUser, json } from "@/lib/auth";
import { query } from "@/lib/db";

// Current user. Role and read-only flag come from the DATABASE (not the login cookie), so changes made by
// an admin show up immediately. readOnly = PostgreSQL says this user's login role may not INSERT likes.
export async function GET() {
  const user = await getUser();
  if (!user) return json({ user: null });
  const { rows: [r] } = await query(
    `SELECT app_role, db_role, db_role_exists,
            CASE WHEN db_role_exists THEN NOT has_table_privilege(db_role, 'public.feedback', 'INSERT') ELSE false END AS read_only
     FROM v_user_db_roles WHERE user_id = $1`, [user.id]).catch(() => ({ rows: [] }));
  return json({ user: r ? { ...user, role: r.app_role, dbRole: r.db_role, readOnly: r.read_only } : user });
}
