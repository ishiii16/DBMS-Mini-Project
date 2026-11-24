import { query } from "@/lib/db";
import { guard, json, int, requirePriv } from "@/lib/auth";
// Log a listening event (no audio streaming — out of scope)
export const POST = guard(async (req, _c, user) => {
  const { songId, moodId, msPlayed } = await req.json();
  await requirePriv(user, "listening_events", "INSERT");
  await query("INSERT INTO listening_events (user_id, song_id, ms_played, context_mood_id) VALUES ($1, $2, $3, $4)",
              [user.id, int(songId), int(msPlayed) ?? 30000, int(moodId)]);
  return json({ ok: true });
});
export const GET = guard(async (_r, _c, user) => {
  const { rows } = await query(`SELECT le.played_at, d.song_id, d.title, d.artists, d.mood
    FROM listening_events le JOIN v_song_details d USING (song_id)
    WHERE le.user_id = $1 ORDER BY le.played_at DESC LIMIT 30`, [user.id]);
  return json(rows);
});
