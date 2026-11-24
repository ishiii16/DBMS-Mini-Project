import { query, tx } from "@/lib/db";
import { guard, json, int, err, body, str, requirePriv } from "@/lib/auth";

const owns = async (pid, uid) => (await query("SELECT 1 FROM playlists WHERE playlist_id=$1 AND user_id=$2", [pid, uid])).rowCount > 0;
// The user's playlist row (or undefined): tells us whether it is the automatic "♥ Liked songs" playlist
const mine = async (pid, uid) => (await query("SELECT playlist_id, is_liked FROM playlists WHERE playlist_id=$1 AND user_id=$2", [pid, uid])).rows[0];
const AUTO = "“♥ Liked songs” is automatic — like (♥) or un-like songs to change it";

export const GET = guard(async (_r, { params }, user) => {
  const pid = int(params.id);
  if (!(await owns(pid, user.id))) return err("Not found", 404);
  const { rows } = await query(`SELECT ps.position, d.song_id, d.title, d.artists, d.mood
    FROM playlist_songs ps JOIN v_song_details d USING (song_id) WHERE ps.playlist_id = $1 ORDER BY ps.position`, [pid]);
  return json(rows);
});

// Add a song at the end. Row-lock the playlist (SELECT ... FOR UPDATE) so concurrent adds
// are serialised and each gets a distinct MAX(position)+1; UNIQUE(playlist_id, position) backs this up.
export const POST = guard(async (req, { params }, user) => {
  const pid = int(params.id);
  const { songId } = await body(req);
  const sid = int(songId);
  if (!sid) return err("songId required");
  const p = await mine(pid, user.id);
  if (!p) return err("Not found", 404);
  await requirePriv(user, p.is_liked ? "feedback" : "playlist_songs", "INSERT");   // DCL check
  if (p.is_liked) {   // adding to Liked songs = liking the song; trigger feedback_liked_playlist_aiud does the insert
    const { rowCount } = await query(`INSERT INTO feedback (user_id, song_id, rating) VALUES ($1, $2, 1)
      ON CONFLICT (user_id, song_id) DO UPDATE SET rating = 1, rated_at = now() WHERE feedback.rating <> 1`, [user.id, sid]);
    return rowCount ? json({ ok: true, liked: true }) : err("Already in that playlist", 409);
  }
  const found = await tx(async (c) => {
    const { rowCount } = await c.query("SELECT 1 FROM playlists WHERE playlist_id=$1 AND user_id=$2 FOR UPDATE", [pid, user.id]);
    if (!rowCount) return false;
    await c.query(`INSERT INTO playlist_songs (playlist_id, song_id, position)
                   SELECT $1, $2, COALESCE(MAX(position), 0) + 1 FROM playlist_songs WHERE playlist_id = $1`, [pid, sid]);
    return true;
  });
  return found ? json({ ok: true }) : err("Not found", 404);
});

// Rename a playlist (UNIQUE(user_id, name) -> 409 via guard; CHECK playlists_name_not_blank backs up validation)
export const PATCH = guard(async (req, { params }, user) => {
  const name = str((await body(req)).name);
  if (!name) return err("Name required");
  if (name.length > 100) return err("Playlist name must be at most 100 characters");
  const p = await mine(int(params.id), user.id);
  if (!p) return err("Not found", 404);
  if (p.is_liked) return err(AUTO, 400);
  await requirePriv(user, "playlists", "UPDATE");
  const { rowCount } = await query("UPDATE playlists SET name=$3 WHERE playlist_id=$1 AND user_id=$2 AND NOT is_liked", [int(params.id), user.id, name]);
  return rowCount ? json({ ok: true }) : err("Not found", 404);
});

// DELETE /api/playlists/:id          -> delete playlist (ON DELETE CASCADE removes playlist_songs rows)
// DELETE /api/playlists/:id?song=:sid -> remove one song and close the gap in positions, in ONE transaction
export const DELETE = guard(async (req, { params }, user) => {
  const pid = int(params.id), sid = int(new URL(req.url).searchParams.get("song"));
  const p = await mine(pid, user.id);
  if (!p) return err("Not found", 404);
  if (!sid) {
    if (p.is_liked) return err(AUTO, 400);
    await requirePriv(user, "playlists", "DELETE");
    const { rowCount } = await query("DELETE FROM playlists WHERE playlist_id=$1 AND user_id=$2 AND NOT is_liked", [pid, user.id]);
    return rowCount ? json({ ok: true }) : err("Not found", 404);
  }
  await requirePriv(user, p.is_liked ? "feedback" : "playlist_songs", "DELETE");
  if (p.is_liked) {   // removing from Liked songs = un-liking; the trigger removes it and renumbers positions
    const { rowCount } = await query("DELETE FROM feedback WHERE user_id=$1 AND song_id=$2 AND rating=1", [user.id, sid]);
    return rowCount ? json({ ok: true, unliked: true }) : err("Not found", 404);
  }
  const removed = await tx(async (c) => {
    const { rowCount } = await c.query("SELECT 1 FROM playlists WHERE playlist_id=$1 AND user_id=$2 FOR UPDATE", [pid, user.id]);
    if (!rowCount) return false;
    const { rows: [gone] } = await c.query("DELETE FROM playlist_songs WHERE playlist_id=$1 AND song_id=$2 RETURNING position", [pid, sid]);
    if (!gone) return false;
    // Two-step renumber (shift out of range, then back down by one) so UNIQUE(playlist_id, position)
    // and CHECK(position > 0) are never violated mid-update
    await c.query("UPDATE playlist_songs SET position = position + 1000000 WHERE playlist_id=$1 AND position > $2", [pid, gone.position]);
    await c.query("UPDATE playlist_songs SET position = position - 1000001 WHERE playlist_id=$1 AND position > 1000000", [pid]);
    return true;
  });
  return removed ? json({ ok: true }) : err("Not found", 404);
});
