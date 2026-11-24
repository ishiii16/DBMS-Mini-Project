"use client";
import { useEffect, useRef, useState } from "react";
import SongTable from "@/components/SongTable";
import { Cover, MOOD, Skeleton } from "@/components/ui";
import SongActions, { useLibrary } from "@/components/SongActions";

const Feat = ({ label, value, max = 1, unit = "", c }) => (
  <div className="feat">
    <div className="l"><span>{label}</span><span>{max === 1 ? (+value).toFixed(2) : `${Math.round(value)}${unit}`}</span></div>
    <div className="trk"><div className="fil" style={{ width: `${Math.min(100, (100 * value) / max)}%`, ...(c ? { background: c } : {}) }} /></div>
  </div>);

export default function Song({ params }) {
  const [d, setD] = useState(null); const [moods, setMoods] = useState([]); const [mood, setMood] = useState(""); const [w, setW] = useState(0.5);
  useEffect(() => { fetch("/api/moods").then((r) => r.json()).then(setMoods); }, []);
  useEffect(() => {
    const t = setTimeout(() => fetch(`/api/similar?seed=${params.id}&audio=${w}${mood ? `&mood=${mood}` : ""}`).then((r) => r.json()).then(setD), 150);
    return () => clearTimeout(t);
  }, [params.id, mood, w]);
  const s = d?.seed;
  const lib = useLibrary(); const simRef = useRef(null);
  const toSimilar = () => simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (<>
    {s ? <div className="card">
      <div className="detail">
        <Cover title={s.title} mood={s.mood} />
        <div>
          <span className={`tag ${s.mood}`}>{s.mood}</span>
          <h1 style={{ margin: "10px 0 4px" }}>{s.title}</h1>
          <p className="mut" style={{ margin: 0 }}><b style={{ color: "var(--txt)" }}>{s.artists}</b> · {s.album_name}</p>
          <p className="dim" style={{ margin: "4px 0 0", fontSize: 13 }}>{s.genres} · popularity {s.popularity}</p>
          {s.description && <p style={{ margin: "10px 0 0", fontSize: 14 }}>🎧 {s.description}</p>}
          <SongActions song={s} lib={lib} variant="full" onSimilar={toSimilar} />
          <div className={`feats ${s.mood}`}>
            <Feat label="Valence (happiness)" value={s.valence} c="var(--c)" />
            <Feat label="Energy" value={s.energy} c="var(--c)" />
            <Feat label="Danceability" value={s.danceability} />
            <Feat label="Tempo" value={s.tempo} max={200} unit=" BPM" />
          </div>
        </div>
      </div>
    </div> : <div className="card"><Skeleton rows={2} /></div>}

    <div className="card" ref={simRef} style={{ scrollMarginTop: 80 }}>
      <div className="card-h"><h3>Songs that feel like this</h3></div>
      <div className="controls">
        <div>
          <label className="f" style={{ marginTop: 0 }}>“Like this, but…”</label>
          <div className="chips">
            <button className={`chip ${mood === "" ? "on" : ""}`} onClick={() => setMood("")}>Any mood</button>
            {moods.map((m) => <button key={m.mood_id} className={`chip ${m.name} ${String(mood) === String(m.mood_id) ? "on" : ""}`}
              onClick={() => setMood(m.mood_id)}>{MOOD[m.name]?.emoji} {m.name.toLowerCase()}</button>)}
          </div>
        </div>
        <div>
          <label className="f" style={{ marginTop: 0, display: "flex", justifyContent: "space-between" }}>
            <span>Match on</span><span>{Math.round((1 - w) * 100)}% description · {Math.round(w * 100)}% sound</span></label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <span className="dim" style={{ fontSize: 12 }}>📝 Text</span>
            <input type="range" min="0" max="1" step="0.1" value={w} onChange={(e) => setW(+e.target.value)} style={{ flex: 1 }} />
            <span className="dim" style={{ fontSize: 12 }}>🔊 Audio</span>
          </div>
        </div>
      </div>
      {d ? <SongTable songs={d.results} lib={lib} emptyText="No similar songs in that mood." /> : <Skeleton />}
    </div>
  </>);
}
