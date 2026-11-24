import { query } from "@/lib/db";
import { guard, json } from "@/lib/auth";
export const GET = guard(async (_r, _c, user) => {
  const [genres, moods, totals] = await Promise.all([
    // Slide 12 query: JOIN · GROUP BY · HAVING · ORDER BY
    query(`SELECT g.name, COUNT(*)::int AS plays FROM listening_events le
           JOIN song_genres sg USING (song_id) JOIN genres g USING (genre_id)
           WHERE le.user_id = $1 GROUP BY g.name HAVING COUNT(*) >= 3 ORDER BY plays DESC LIMIT 5`, [user.id]),
    query("SELECT mood, plays::int FROM v_user_top_moods WHERE user_id = $1 ORDER BY plays DESC", [user.id]),
    query(`SELECT (SELECT COUNT(*) FROM listening_events WHERE user_id=$1)::int AS plays,
                  (SELECT COUNT(*) FROM feedback WHERE user_id=$1 AND rating=1)::int AS likes,
                  (SELECT COUNT(*) FROM playlists WHERE user_id=$1)::int AS playlists`, [user.id]),
  ]);
  return json({ genres: genres.rows, moods: moods.rows, totals: totals.rows[0] });
});
