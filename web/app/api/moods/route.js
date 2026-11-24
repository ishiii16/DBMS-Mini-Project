import { query } from "@/lib/db";
import { guard, json } from "@/lib/auth";
export const GET = guard(async () => {
  const { rows } = await query(`SELECT m.*, COUNT(s.song_id)::int AS songs FROM moods m
                                LEFT JOIN songs s USING (mood_id) GROUP BY m.mood_id ORDER BY m.mood_id`);
  return json(rows);
});
