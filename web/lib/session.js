// Edge-safe JWT helpers (used by middleware and API routes)
import { SignJWT, jwtVerify } from "jose";
// The signing secret must come from the environment - never a hard-coded fallback (anyone could forge admin tokens)
const key = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is missing or too short - set it in web/.env.local");
  return new TextEncoder().encode(s);
};
export const COOKIE = "mm_session";
export const sign = (p) => new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(key());
export async function verify(token) {
  try { return token ? (await jwtVerify(token, key())).payload : null; } catch { return null; }
}
