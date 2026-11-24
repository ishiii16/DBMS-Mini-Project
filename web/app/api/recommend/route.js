import { query } from "@/lib/db";
import { guard, json, int } from "@/lib/auth";
// Mood picker -> stored function recommend(user, mood)
export const GET = guard(async (req, _c, user) => {
  const mood = int(new URL(req.url).searchParams.get("mood"));
  const { rows } = await query("SELECT * FROM recommend($1, $2, 20)", [user.id, mood]);
  return json(rows);
});
