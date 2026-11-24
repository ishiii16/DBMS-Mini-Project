import { query } from "@/lib/db";
import { guard, json, int, err } from "@/lib/auth";
export const GET = guard(async () => {
  const { rows } = await query(`SELECT u.user_id, u.username, u.email, u.role, u.created_at,
    (SELECT COUNT(*) FROM listening_events le WHERE le.user_id=u.user_id)::int AS plays
    FROM users u ORDER BY u.user_id`);
  return json(rows);
}, { admin: true });
export const PUT = guard(async (req, _c, me) => {
  const { userId, role } = await req.json();
  if (int(userId) === me.id) return err("You cannot change your own role");
  await query("UPDATE users SET role=$2 WHERE user_id=$1", [int(userId), role]);
  return json({ ok: true });
}, { admin: true });
export const DELETE = guard(async (req, _c, me) => {
  const id = int(new URL(req.url).searchParams.get("id"));
  if (id === me.id) return err("You cannot delete yourself");
  await query("DELETE FROM users WHERE user_id=$1", [id]);
  return json({ ok: true });
}, { admin: true });
