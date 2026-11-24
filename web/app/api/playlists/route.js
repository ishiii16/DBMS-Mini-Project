import { query, tx } from "@/lib/db";
import { guard, json, int, err, body, str, requirePriv } from "@/lib/auth";

export const GET = guard(async (_r, _c, user) => {
  // "♥ Liked songs" (is_liked, maintained by triggers) is always listed first
  const { rows } = await query(`SELECT p.playlist_id, p.name, p.is_liked, m.name AS mood, COUNT(ps.song_id)::int AS songs
    FROM playlists p LEFT JOIN moods m USING (mood_id) LEFT JOIN playlist_songs ps USING (playlist_id)
    WHERE p.user_id = $1 GROUP BY p.playlist_id, m.name ORDER BY p.is_liked DESC, p.created_at DESC`, [user.id]);
  return json(rows);
});

// Create playlist + its songs in ONE transaction. Optional fromMood auto-fills with recommend().
export const POST = guard(async (req, _c, user) => {
  await requirePriv(user, "playlists", "INSERT");   // DCL check: restricted users are read-only
  const b = await body(req);
  const name = str(b.name), moodId = b.moodId, fromMood = b.fromMood === true;
  const songIds = Array.isArray(b.songIds) ? b.songIds.slice(0, 500) : [];
  if (!name) return err("Name required");
  if (name.length > 100) return err("Playlist name must be at most 100 characters");
  const id = await tx(async (c) => {
    const { rows: [p] } = await c.query(
      "INSERT INTO playlists (user_id, name, mood_id) VALUES ($1, $2, $3) RETURNING playlist_id", [user.id, name, int(moodId)]);
    let ids = songIds.map(int);
    if (fromMood) ids = (await c.query("SELECT song_id FROM recommend($1, $2, 20)", [user.id, int(moodId)])).rows.map((r) => r.song_id);
    for (let i = 0; i < ids.length; i++)
      await c.query("INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES ($1, $2, $3)", [p.playlist_id, ids[i], i + 1]);
    return p.playlist_id;
  });
  return json({ playlist_id: id }, 201);
});
