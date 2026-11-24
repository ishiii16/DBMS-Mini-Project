import { query } from "@/lib/db";
import { guard, json } from "@/lib/auth";
export const GET = guard(async () => {
  const [byMood, byGenre, byDay, counts, topSongs] = await Promise.all([
    query("SELECT mood, SUM(plays)::int AS plays FROM v_plays_by_mood_day GROUP BY mood ORDER BY plays DESC"),
    query(`SELECT g.name, COUNT(*)::int AS plays FROM listening_events le JOIN song_genres sg USING (song_id)
           JOIN genres g USING (genre_id) GROUP BY g.name ORDER BY plays DESC LIMIT 10`),
    query("SELECT day, SUM(plays)::int AS plays FROM v_plays_by_mood_day WHERE day > now() - interval '30 days' GROUP BY day ORDER BY day"),
    query(`SELECT (SELECT COUNT(*) FROM users)::int users, (SELECT COUNT(*) FROM songs)::int songs,
                  (SELECT COUNT(*) FROM song_embeddings)::int embedded, (SELECT COUNT(*) FROM listening_events)::int plays,
                  (SELECT model FROM song_embeddings LIMIT 1) model`),
    query(`SELECT song_id, title, artists, mood, plays::int, listeners::int, likes::int
           FROM v_popular_songs ORDER BY plays DESC, likes DESC LIMIT 10`),
  ]);
  return json({ byMood: byMood.rows, byGenre: byGenre.rows, byDay: byDay.rows, counts: counts.rows[0], topSongs: topSongs.rows });
}, { admin: true });
