import { query } from "@/lib/db";
import { guard, json } from "@/lib/auth";
// Full-text search on title/album (GIN tsvector) + trigram match on artist name
export const GET = guard(async (req) => {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return json([]);
  const { rows } = await query(`
    SELECT d.song_id, d.title, d.artists, d.mood, d.genres, d.popularity
    FROM v_song_details d
    WHERE d.song_id IN (
      SELECT song_id FROM songs WHERE search_tsv @@ plainto_tsquery('simple', $1)
      UNION
      SELECT sa.song_id FROM song_artists sa JOIN artists a USING (artist_id) WHERE a.name ILIKE '%' || $1 || '%')
    ORDER BY d.popularity DESC LIMIT 50`, [q]);
  return json(rows);
});
