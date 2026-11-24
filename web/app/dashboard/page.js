"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bars, Cover, Skeleton } from "@/components/ui";

const ago = (t) => {
  const s = (Date.now() - new Date(t)) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

export default function Dashboard() {
  const [d, setD] = useState(null); const [hist, setHist] = useState([]);
  useEffect(() => { fetch("/api/dashboard").then((r) => r.json()).then(setD); fetch("/api/play").then((r) => r.json()).then(setHist); }, []);
  if (!d) return <><h1>Your dashboard</h1><Skeleton rows={4} /></>;
  const top = d.moods[0]?.mood;
  return (<>
    <h1>Your dashboard</h1>
    <p className="sub">{top ? <>You've mostly been in a <span className={`tag ${top}`}>{top}</span> mood lately.</> : "Play a few songs to see your listening profile."}</p>
    <div className="stats">
      <div className="stat"><div className="k">Plays</div><div className="v">{d.totals.plays}</div></div>
      <div className="stat"><div className="k">Liked songs</div><div className="v">{d.totals.likes}</div></div>
      <div className="stat"><div className="k">Playlists</div><div className="v">{d.totals.playlists}</div></div>
    </div>
    <div className="grid g2">
      <div className="card" style={{ margin: 0 }}><h3>Top moods</h3><Bars rows={d.moods} label="mood" colorByMood /></div>
      <div className="card" style={{ margin: 0 }}><h3>Top genres <span className="dim" style={{ fontWeight: 500, fontSize: 13 }}>· 3+ plays</span></h3><Bars rows={d.genres} label="name" /></div>
    </div>
    <div className="card">
      <h3>Recently played</h3>
      <div className="songs">{hist.map((h, i) => <div className="song nosim" key={i}>
        <span className="n">{i + 1}</span><Cover title={h.title} mood={h.mood} />
        <div className="t"><Link href={`/song/${h.song_id}`}>{h.title}</Link><div className="a">{h.artists}</div></div>
        <span className="md"><span className={`tag ${h.mood}`}>{h.mood}</span></span>
        <span className="dim" style={{ fontSize: 13, textAlign: "right" }}>{ago(h.played_at)}</span>
      </div>)}</div>
    </div>
  </>);
}
