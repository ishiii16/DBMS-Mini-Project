import { NextResponse } from "next/server";
import { COOKIE, verify } from "./lib/session";

export async function middleware(req) {
  const user = await verify(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (p.startsWith("/admin") && user.role !== "admin") return NextResponse.redirect(new URL("/?denied=1", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/", "/search", "/dashboard", "/playlists", "/song/:path*", "/admin/:path*"] };
