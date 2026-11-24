"use client";
import { useEffect, useState } from "react";
import SongTable from "@/components/SongTable";
import { Empty, Skeleton } from "@/components/ui";

const SUGGEST = ["Coldplay", "Taylor Swift", "love", "night", "Arijit Singh", "piano"];

export default function Search() {
  const [q, setQ] = useState(""); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false);
  // Live search, debounced 300 ms
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      setRes(await (await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)).json()); setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (<>
    <h1>Search</h1>
    <p className="sub">Full-text search over titles and albums, plus fuzzy artist matching.</p>
    <div className="searchbar"><span className="ic">⌕</span>
      <input autoFocus placeholder="Search songs, albums or artists…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {!q && <div className="chips" style={{ marginTop: 12 }}>
      <span className="dim" style={{ fontSize: 13, alignSelf: "center" }}>Try:</span>
      {SUGGEST.map((s) => <button key={s} className="chip" onClick={() => setQ(s)}>{s}</button>)}</div>}
    <div className="card">
      {!q ? <Empty icon="🎼">Start typing to search the catalogue. Want to search by feeling? Use the ✨ box on Discover.</Empty>
        : busy && !res ? <Skeleton />
        : <>{res && <p className="mut" style={{ margin: "0 0 8px", fontSize: 13 }}>{res.length}{res.length === 50 ? "+" : ""} results for “{q}”</p>}
            <SongTable songs={res} showSim={false} emptyText={`Nothing matched “${q}”.`} /></>}
    </div>
  </>);
}
