import { query } from "@/lib/db";
import { guard, json, int, requirePriv } from "@/lib/auth";
// Like (+1) / dislike (-1) / clear (0). Trigger feedback_taste_aiud refreshes the taste vector.
export const POST = guard(async (req, _c, user) => {
  const { songId, rating } = await req.json();
  await requirePriv(user, "feedback", +rating === 0 ? "DELETE" : "INSERT");   // DCL check: restricted users are read-only
  if (+rating === 0) await query("DELETE FROM feedback WHERE user_id = $1 AND song_id = $2", [user.id, int(songId)]);
  else await query(`INSERT INTO feedback (user_id, song_id, rating) VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, song_id) DO UPDATE SET rating = EXCLUDED.rating, rated_at = now()`,
                   [user.id, int(songId), int(rating)]);
  return json({ ok: true });
});
export const GET = guard(async (_r, _c, user) => {
  const { rows } = await query("SELECT song_id, rating FROM feedback WHERE user_id = $1", [user.id]);
  return json(Object.fromEntries(rows.map((r) => [r.song_id, r.rating])));
});
