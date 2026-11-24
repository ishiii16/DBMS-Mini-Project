import { query } from "@/lib/db";
import { guard, json, int, err } from "@/lib/auth";
import { embed } from "@/lib/embed";
// Natural-language discovery: "peaceful songs for studying" -> embedding -> stored function semantic_search()
export const GET = guard(async (req, _c, user) => {
  const p = new URL(req.url).searchParams;
  const q = (p.get("q") || "").trim();
  if (!q) return err("Describe what you want to hear");
  if (q.length > 300) return err("Please keep the description under 300 characters");
  const { rows } = await query("SELECT * FROM semantic_search($1::vector, $2, $3, 20)", [await embed(q), user.id, int(p.get("mood"))]);
  return json(rows);
});
