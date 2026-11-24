import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { json, err, body, str } from "@/lib/auth";
import { sign, COOKIE } from "@/lib/session";
import { limiter, clientIp } from "@/lib/ratelimit";

// Brute-force protection: failed attempts per account and per client IP
const perAccount = limiter({ max: 5, windowMs: 15 * 60_000 });
const perIp = limiter({ max: 100, windowMs: 15 * 60_000 });

export async function POST(req) {
  const b = await body(req);
  const email = str(b.email).toLowerCase(), password = typeof b.password === "string" ? b.password : "";
  const ip = clientIp(req), acct = `login:${email}`, ipk = `loginip:${ip}`;
  if (perAccount.blocked(acct) || perIp.blocked(ipk)) {
    const wait = Math.max(perAccount.retryAfter(acct), perIp.retryAfter(ipk));
    const res = err(`Too many failed attempts. Try again in ${Math.ceil(wait / 60)} min.`, 429);
    res.headers.set("Retry-After", String(wait)); return res;
  }
  if (!email || !password) return err("Email and password are required", 400);

  // Count the attempt BEFORE the slow bcrypt check so parallel guesses can't all slip past the limit
  perAccount.hit(acct); perIp.hit(ipk);
  const { rows: [u] } = await query("SELECT user_id, username, role, password_hash FROM users WHERE email = $1", [email]);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) return err("Invalid email or password", 401);
  perAccount.reset(acct); perIp.undo(ipk); // success doesn't count as a failure
  const res = json({ user: { user_id: u.user_id, username: u.username, role: u.role } });
  res.cookies.set(COOKIE, await sign({ id: u.user_id, name: u.username, role: u.role }), { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
