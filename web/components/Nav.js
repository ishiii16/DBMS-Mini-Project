"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [["/", "Discover"], ["/search", "Search"], ["/playlists", "Playlists"], ["/dashboard", "Dashboard"]];

export default function Nav() {
  const [user, setUser] = useState(null); const path = usePathname(); const router = useRouter();
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((d) => setUser(d.user)).catch(() => {}); }, [path]);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); router.push("/login"); };
  const on = (href) => (href === "/" ? path === "/" : path.startsWith(href)) ? "navlink on" : "navlink";
  return (
    <nav className="top"><div className="in">
      <Link href="/" className="brand"><span className="logo">🎧</span>MoodTune</Link>
      {user && <>
        {LINKS.map(([h, l]) => <Link key={h} href={h} className={on(h)}>{l}</Link>)}
        {user.role === "admin" && <Link href="/admin" className={on("/admin")}>Admin</Link>}
        <div className="who">
          <span className="avatar">{(user.name || "?")[0]}</span>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</span>
          {user.role === "admin" && <span className="role">admin</span>}
          {user.readOnly && <span className="role ro" title={`PostgreSQL role ${user.dbRole} is in moodtune_restricted`}>🔒 read-only</span>}
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </>}
    </div></nav>);
}
