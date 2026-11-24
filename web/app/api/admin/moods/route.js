import { tx } from "@/lib/db";
import { guard, json, int, err } from "@/lib/auth";
// Edit thresholds and re-tag all songs atomically
export const PUT = guard(async (req) => {
  const { moods } = await req.json();
  if (!Array.isArray(moods) || !moods.length) return err("moods array required");
  const retagged = await tx(async (c) => {
    for (const m of moods)
      await c.query("UPDATE moods SET valence_min=$2, valence_max=$3, energy_min=$4, energy_max=$5 WHERE mood_id=$1",
                    [int(m.mood_id), m.valence_min, m.valence_max, m.energy_min, m.energy_max]);
    return (await c.query("SELECT retag_all_songs() AS n")).rows[0].n;
  });
  return json({ retagged });
}, { admin: true });
