"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bars, MOOD, Skeleton, toast } from "@/components/ui";

const LABEL = { users: "Users", songs: "Songs", embedded: "Embedded", plays: "Plays", model: "Embedding model" };

export default function Admin() {
  const [a, setA] = useState(null); const [moods, setMoods] = useState([]); const [users, setUsers] = useState([]);
  const [log, setLog] = useState(""); const [busy, setBusy] = useState(false); const [limit, setLimit] = useState("20000");
  const load = () => {
    fetch("/api/admin/analytics").then((r) => r.json()).then(setA);
    fetch("/api/moods").then((r) => r.json()).then(setMoods);
    fetch("/api/admin/users").then((r) => r.json()).then(setUsers);
  };
  useEffect(load, []);
  const editMood = (i, k, v) => setMoods(moods.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  const saveMoods = async () => {
    const r = await fetch("/api/admin/moods", { method: "PUT", body: JSON.stringify({ moods }) }); const d = await r.json();
    toast(r.ok ? `Saved — re-tagged ${d.retagged.toLocaleString()} songs` : d.error, !r.ok); load();
  };
  const role = async (u, role) => {
    const r = await fetch("/api/admin/users", { method: "PUT", body: JSON.stringify({ userId: u.user_id, role }) });
    toast(r.ok ? `${u.username} is now ${role} (database role moved to moodtune_${role})` : (await r.json()).error, !r.ok); load();
  };
  const delUser = async (u) => {
    if (!confirm(`Delete ${u.username} and all their data?`)) return;
    const r = await fetch(`/api/admin/users?id=${u.user_id}`, { method: "DELETE" });
    toast(r.ok ? `Deleted ${u.username}` : (await r.json()).error, !r.ok); load();
  };
  const etl = async () => {
    if (!confirm("Re-import the catalog and regenerate all embeddings? This resets plays, likes and playlists.")) return;
    setBusy(true); setLog("Running pipeline…");
    const r = await fetch("/api/admin/etl", { method: "POST", body: JSON.stringify({ limit }) }); const d = await r.json();
    setLog(d.log || d.error); setBusy(false); load();
  };
  if (!a) return <><h1>Admin</h1><Skeleton rows={4} /></>;

  return (<>
    <div className="card-h"><h1 style={{ margin: 0 }}>Admin console</h1>
      <div className="row"><Link className="btn ghost" href="/admin/roles">🔐 Login/Group Roles</Link>
        <Link className="btn" href="/admin/database">🗄️ Database explorer (live)</Link></div></div>
    <p className="sub">Catalog health, listening analytics, mood rules and user management.</p>
    <div className="stats">{Object.entries(a.counts).map(([k, v]) =>
      <div className="stat" key={k}><div className="k">{LABEL[k] || k}</div><div className={`v ${typeof v === "string" ? "small" : ""}`}>{typeof v === "number" ? v.toLocaleString() : v}</div></div>)}</div>

    <div className="grid g2">
      <div className="card" style={{ margin: 0 }}><h3>Plays by mood</h3><Bars rows={a.byMood} label="mood" colorByMood /></div>
      <div className="card" style={{ margin: 0 }}><h3>Top 10 genres</h3><Bars rows={a.byGenre} label="name" /></div>
    </div>
    <div className="card"><h3>Most played songs</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>#</th><th>Song</th><th>Mood</th><th>Plays</th><th>Listeners</th><th>Likes</th></tr></thead>
        <tbody>{(a.topSongs || []).map((s, i) => <tr key={s.song_id}><td>{i + 1}</td>
          <td><b>{s.title}</b><div className="mut" style={{ fontSize: 13 }}>{s.artists}</div></td>
          <td>{s.mood && <span className={`tag ${s.mood}`}>{s.mood}</span>}</td>
          <td>{s.plays}</td><td>{s.listeners}</td><td>{s.likes}</td></tr>)}</tbody>
      </table></div>
    </div>
    <div className="card"><h3>Plays per day <span className="dim" style={{ fontWeight: 500, fontSize: 13 }}>· last 30 days</span></h3>
      <Bars rows={a.byDay.map((d) => ({ ...d, day: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }))} label="day" /></div>

    <div className="card">
      <div className="card-h"><h3>Mood thresholds</h3><button onClick={saveMoods}>Save & re-tag songs</button></div>
      <p className="mut" style={{ marginTop: 0, fontSize: 13 }}>Each mood is a box on the valence × energy plane. Saving runs <code>retag_all_songs()</code> in one transaction.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Mood</th><th>Valence min</th><th>Valence max</th><th>Energy min</th><th>Energy max</th><th>Songs</th></tr></thead>
        <tbody>{moods.map((m, i) => <tr key={m.mood_id}><td><span className={`tag ${m.name}`}>{m.name}</span></td>
          {["valence_min", "valence_max", "energy_min", "energy_max"].map((k) => <td key={k}>
            <input style={{ width: 84 }} type="number" step="0.05" min="0" max="1" value={m[k]} onChange={(e) => editMood(i, k, e.target.value)} /></td>)}
          <td style={{ fontWeight: 600 }}>{m.songs.toLocaleString()}</td></tr>)}</tbody>
      </table></div>
    </div>

    <div className="card"><h3>Users</h3>
      <div className="tablewrap"><table>
        <thead><tr><th>User</th><th>Email</th><th>Plays</th><th>Joined</th><th>Role</th><th></th></tr></thead>
        <tbody>{users.map((u) => <tr key={u.user_id}>
          <td><div className="row" style={{ flexWrap: "nowrap" }}><span className="avatar">{u.username[0]}</span><b>{u.username}</b></div></td>
          <td className="mut">{u.email}</td><td>{u.plays}</td>
          <td className="mut">{new Date(u.created_at).toLocaleDateString()}</td>
          <td><select value={u.role} onChange={(e) => role(u, e.target.value)}><option>listener</option><option>restricted</option><option>admin</option></select></td>
          <td style={{ textAlign: "right" }}><button className="danger" onClick={() => delUser(u)}>Delete</button></td></tr>)}</tbody>
      </table></div>
    </div>

    <div className="card"><h3>Catalog import & embeddings</h3>
      <p className="mut" style={{ marginTop: 0, fontSize: 13 }}>Runs <code>etl/pipeline.py</code>: clean CSV → tag moods → generate vectors → load, all in one transaction.</p>
      <div className="row">
        <label className="mut" style={{ fontSize: 14 }}>Max songs&nbsp;<input value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 110 }} /></label>
        <button disabled={busy} onClick={etl}>{busy ? "Running…" : "Import & regenerate embeddings"}</button>
      </div>
      {log && <pre className="log">{log}</pre>}
    </div>
  </>);
}
