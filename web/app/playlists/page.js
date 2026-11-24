"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cover, Empty, MOOD, toast } from "@/components/ui";

export default function Playlists() {
  const [pls, setPls] = useState(null); const [open, setOpen] = useState(null); const [songs, setSongs] = useState([]);
  const [name, setName] = useState(""); const [moods, setMoods] = useState([]); const [mood, setMood] = useState(""); const [e, setE] = useState("");
  const load = () => fetch("/api/playlists").then((r) => r.json()).then(setPls);
  useEffect(() => { load(); fetch("/api/moods").then((r) => r.json()).then(setMoods); }, []);

  const create = async (ev) => {
    ev.preventDefault(); setE("");
    const r = await fetch("/api/playlists", { method: "POST", body: JSON.stringify({ name, moodId: mood || null, fromMood: !!mood }) });
    if (!r.ok) setE(r.status === 409 ? "You already have a playlist with that name" : (await r.json()).error);
    else { toast(`Created “${name}”`); setName(""); setMood(""); load(); }
  };
  const show = async (id) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setSongs([]); setSongs(await (await fetch(`/api/playlists/${id}`)).json());
  };
  const del = async (p) => {
    if (!confirm(`Delete “${p.name}”?`)) return;
    await fetch(`/api/playlists/${p.playlist_id}`, { method: "DELETE" }); setOpen(null); toast("Playlist deleted"); load();
  };
  const rename = async (p) => {
    const name = prompt("Rename playlist", p.name); if (!name || name.trim() === p.name) return;
    const r = await fetch(`/api/playlists/${p.playlist_id}`, { method: "PATCH", body: JSON.stringify({ name }) });
    toast(r.ok ? `Renamed to “${name.trim()}”` : r.status === 409 ? "You already have a playlist with that name" : (await r.json()).error, !r.ok);
    load();
  };
  const removeSong = async (p, s) => {
    const r = await fetch(`/api/playlists/${p.playlist_id}?song=${s.song_id}`, { method: "DELETE" });
    if (!r.ok) return toast((await r.json()).error, true);
    toast(p.is_liked ? `Un-liked “${s.title}” — removed from Liked songs` : `Removed “${s.title}”`); setSongs(songs.filter((x) => x.song_id !== s.song_id)); load();
  };
  const cur = pls?.find((p) => p.playlist_id === open);

  return (<>
    <h1>Your playlists</h1>
    <p className="sub">Create an empty playlist, or let us auto-fill one with 20 recommendations for a mood.</p>
    <form className="card row" onSubmit={create}>
      <input placeholder="New playlist name" value={name} onChange={(ev) => setName(ev.target.value)} style={{ flex: "1 1 220px" }} />
      <select value={mood} onChange={(ev) => setMood(ev.target.value)}>
        <option value="">Empty playlist</option>
        {moods.map((m) => <option key={m.mood_id} value={m.mood_id}>{MOOD[m.name]?.emoji} Auto-fill: {m.name}</option>)}
      </select>
      <button disabled={!name.trim()}>＋ Create</button>
      {e && <span className="err" style={{ margin: 0 }}>{e}</span>}
    </form>

    {pls && !pls.length && <div className="card"><Empty icon="📀">No playlists yet — create one above, or hit “Save as playlist” on Discover.</Empty></div>}
    <div className="plgrid">
      {pls?.map((p) => <div key={p.playlist_id} className={`pl ${p.is_liked ? "likedpl" : p.mood || ""} ${open === p.playlist_id ? "on" : ""}`} onClick={() => show(p.playlist_id)}>
        <div className="art">{p.is_liked ? "♥" : MOOD[p.mood]?.emoji || "🎵"}</div>
        <div className="nm">{p.name}</div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <span className="mut" style={{ fontSize: 13 }}>{p.songs} songs</span>
          {p.is_liked ? <span className="tag">automatic</span> : p.mood && <span className={`tag ${p.mood}`}>{p.mood}</span>}
        </div>
      </div>)}
    </div>

    {cur && <div className="card">
      <div className="card-h"><h3>{cur.name}</h3>
        {cur.is_liked
          ? <span className="mut" style={{ fontSize: 13 }}>Filled automatically by a database trigger whenever you press ♥</span>
          : <div className="row"><button className="ghost" onClick={() => rename(cur)}>Rename</button>
              <button className="danger" onClick={() => del(cur)}>Delete playlist</button></div>}</div>
      {!songs.length ? <Empty icon={cur.is_liked ? "♥" : "➕"}>{cur.is_liked ? "No liked songs yet — press ♥ on any song and it appears here." : "Empty — use “+ Playlist” next to any song to add it here."}</Empty> :
        <div className="songs">{songs.map((s, i) => <div className="song nosim" key={s.song_id}>
          <span className="n">{i + 1}</span><Cover title={s.title} mood={s.mood} />
          <div className="t"><Link href={`/song/${s.song_id}`}>{s.title}</Link><div className="a">{s.artists}</div></div>
          <span className="md"><span className={`tag ${s.mood}`}>{s.mood}</span></span>
          <div className="acts"><Link className="btn ghost" href={`/song/${s.song_id}`} style={{ padding: "7px 12px" }}>Similar</Link>
            <button className="icon" title={cur.is_liked ? "Un-like (removes it from Liked songs)" : "Remove from playlist"} onClick={() => removeSong(cur, s)}>✕</button></div>
        </div>)}</div>}
    </div>}
  </>);
}
