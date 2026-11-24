import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { json, err, body as readBody, str } from "@/lib/auth";
import { sign, COOKIE } from "@/lib/session";
import { limiter, clientIp } from "@/lib/ratelimit";

// Field-level error so the form can show the message under the right input
const fail = (field, error, status = 400) => json({ error, field }, status);
const perIp = limiter({ max: 200, windowMs: 60 * 60_000 }); // account-creation spam guard

export async function POST(req) {
  const ip = `signup:${clientIp(req)}`;
  if (perIp.blocked(ip)) return err("Too many sign-ups from this network. Try again later.", 429);
  perIp.hit(ip);
  const body = await readBody(req);
  const username = str(body.username);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[A-Za-z0-9_.]{3,30}$/.test(username))
    return fail("username", "Username must be 3–30 characters: letters, numbers, _ or .");
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail("email", "Enter a valid email address");
  if (email.length > 255) return fail("email", "Email is too long");
  if (password.length < 8) return fail("password", "Password must be at least 8 characters");
  if (password.length > 72) return fail("password", "Password must be at most 72 characters"); // bcrypt limit

  // Tell the user exactly which value is taken (username check is case-insensitive)
  const { rows: [clash] } = await query(
    `SELECT lower(username) = lower($1) AS user_taken, email = $2 AS email_taken
     FROM users WHERE lower(username) = lower($1) OR email = $2 LIMIT 1`, [username, email]);
  if (clash?.email_taken) return fail("email", "An account with this email already exists — try logging in", 409);
  if (clash?.user_taken) return fail("username", `The username "${username}" is taken — please pick another`, 409);

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows: [u] } = await query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id, username, role",
      [username, email, hash]);
    const res = json({ user: u });
    res.cookies.set(COOKIE, await sign({ id: u.user_id, name: u.username, role: u.role }), { httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  } catch (e) {
    // Race: someone registered the same value between the check and the insert
    if (e.code === "23505")
      return e.constraint === "users_email_key"
        ? fail("email", "An account with this email already exists", 409)
        : fail("username", "That username is taken — please pick another", 409);
    throw e;
  }
}
