import { json } from "@/lib/auth";
import { COOKIE } from "@/lib/session";
export async function POST() { const r = json({ ok: true }); r.cookies.delete(COOKIE); return r; }
