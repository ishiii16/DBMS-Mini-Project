import { query } from "@/lib/db";
import { guard, json, int, err } from "@/lib/auth";
// "More like this": vector similarity from a seed song (text + audio blend)
export const GET = guard(async (req, _c, user) => {
  const p = new URL(req.url).searchParams;
  const seed = int(p.get("seed"));
  if (!seed) return err("seed required");
  const w = Math.min(1, Math.max(0, parseFloat(p.get("audio") ?? "0.5")));
  const [{ rows: [song] }, { rows }] = await Promise.all([
    query("SELECT * FROM v_song_details WHERE song_id = $1", [seed]),
    query("SELECT * FROM similar_songs($1, $2, $3, 20, $4)", [seed, user.id, int(p.get("mood")), w]),
  ]);
  return json({ seed: song ?? null, results: rows });
});
