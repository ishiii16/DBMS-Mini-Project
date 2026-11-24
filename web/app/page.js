"use client";
import { useEffect, useState } from "react";
import SongTable from "@/components/SongTable";
import { MOOD, Skeleton, toast } from "@/components/ui";

export default function Discover() {
  const [moods, setMoods] = useState([]); const [mood, setMood] = useState(null); const [songs, setSongs] = useState(null);
  const [me, setMe] = useState(null);
  const [nonce, setNonce] = useState(0); // bumps on every mood click / shuffle -> fresh picks
  const [text, setText] = useState(""); const [nlq, setNlq] = useState(""); const [nlErr, setNlErr] = useState("");
  useEffect(() => {
    fetch("/api/moods").then((r) => r.json()).then(setMoods);
    fetch("/api/me").then((r) => r.json()).then((d) => setMe(d.user));
    // Defer one tick: this effect runs before the layout's <Toaster> has subscribed, so an immediate toast is lost
    if (new URLSearchParams(location.search).get("denied")) setTimeout(() => toast("That page is for admins only", true), 0);
  }, []);
  // Natural-language query (if any) -> semantic_search(); otherwise personalised recommend()
  useEffect(() => {
    setSongs(null); setNlErr("");
    const m = mood ? `mood=${mood}` : "";
    const url = nlq ? `/api/discover?q=${encodeURIComponent(nlq)}${m ? `&${m}` : ""}` : `/api/recommend${m ? `?${m}` : ""}`;
    fetch(url, { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (r.ok) setSongs(d); else { setNlErr(d.error); setSongs([]); } });
  }, [mood, nlq, nonce]);
  const pick = (id) => { setMood(id); setNonce((n) => n + 1); };
  const ask = (ev) => { ev.preventDefault(); setNlq(text.trim()); };
  const cur = moods.find((m) => m.mood_id === mood);
  const coldStart = !nlq && songs?.length > 0 && songs.every((s) => s.similarity == null);

  const save = async () => {
    if (!songs?.length) return toast("Nothing to save yet", true);
    const name = prompt("Name your playlist", nlq ? nlq.slice(0, 100) : `My ${cur?.name || "Mix"} playlist`); if (!name) return;
    // Save exactly the songs on screen (all inserted in one transaction by the API)
    const r = await fetch("/api/playlists", { method: "POST", body: JSON.stringify({ name, moodId: mood, songIds: songs.map((s) => s.song_id) }) });
    toast(r.ok ? `Saved “${name}” with ${songs.length} songs` : (await r.json()).error, !r.ok);
  };
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (<>
    <div className="hero">
      <div>
        <p className="mut" style={{ margin: 0, fontWeight: 600 }}>{greet}{me ? `, ${me.name}` : ""} 👋</p>
        <h1>How are you <span className="grad">feeling</span> today?</h1>
        <p className="sub" style={{ margin: 0 }}>Pick a mood and we'll rank songs by how close they are to your taste.</p>
      </div>
    </div>

    {me?.readOnly && <div className="ro-banner"><span style={{ fontSize: 20 }}>🔒</span><div><b>Your account is read-only.</b> You can browse, search and get recommendations, but liking songs, logging plays and editing playlists are turned off. (PostgreSQL role <code>{me.dbRole}</code> has no INSERT / UPDATE / DELETE privileges.)</div></div>}

    <form className="searchbar askbar" onSubmit={ask} style={{ marginBottom: 16 }}>
      <span className="ic">✨</span>
      <input placeholder="Describe what you want to hear… e.g. “calm acoustic songs for a rainy evening”" value={text}
        onChange={(e) => { setText(e.target.value); if (!e.target.value.trim()) setNlq(""); }} />
      {nlq && <button type="button" className="ghost" onClick={() => { setText(""); setNlq(""); }}>Clear</button>}
      <button disabled={!text.trim()}>Find songs</button>
    </form>

    <div className="moods">
      <button className={`mood any ${mood === null ? "on" : ""}`} onClick={() => pick(null)}>
        <div className="emo">🎲</div><div className="nm">Any mood</div><div className="ds">Surprise me</div>
        <div className="ct">{moods.reduce((a, m) => a + m.songs, 0).toLocaleString()} songs</div>
      </button>
      {moods.map((m) => <button key={m.mood_id} className={`mood ${m.name} ${mood === m.mood_id ? "on" : ""}`} onClick={() => pick(m.mood_id)}>
        <div className="emo">{MOOD[m.name]?.emoji || "🎵"}</div><div className="nm">{m.name}</div>
        <div className="ds">{MOOD[m.name]?.desc}</div><div className="ct">{m.songs.toLocaleString()} songs</div>
      </button>)}
    </div>

    <div className="card">
      <div className="card-h">
        <div>
          <h3>{nlq ? `✨ Songs for “${nlq}”${cur ? ` · ${cur.name}` : ""}` : cur ? `${MOOD[cur.name]?.emoji} ${cur.name} picks for you` : "Recommended for you"}</h3>
          <p className="mut" style={{ margin: "4px 0 0", fontSize: 13 }}>
            {nlErr ? <span className="err">{nlErr}</span>
              : nlq ? "Your sentence is embedded with all-MiniLM-L6-v2 and matched by cosine similarity against each song's description."
              : coldStart ? "Like a few songs (♥) to personalise — until then: popular tracks, boosted towards genres you play."
              : "Match score blends your taste vector (liked songs), how they sound, your favourite genres and popularity, minus songs like ones you disliked."}
          </p>
        </div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          {!nlq && <button className="ghost" onClick={() => setNonce((n) => n + 1)} title="Get a different set of songs">🔀 Shuffle</button>}
          <button onClick={save}>＋ Save as playlist</button>
        </div>
      </div>
      {songs ? <SongTable songs={songs} moodId={mood} emptyText="No new songs in this mood — you've heard them all!" /> : <Skeleton />}
    </div>
  </>);
}
