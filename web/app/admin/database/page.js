"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// Live, read-only view of every PostgreSQL table and view. Polls every 2 s; new rows and changed counts flash.
const EVERY = 2000;
const GROUPS = [
  ["Users & activity", ["users", "listening_events", "feedback", "playlists", "playlist_songs"]],
  ["Catalogue", ["songs", "artists", "song_artists", "genres", "song_genres", "moods"]],
  ["Vectors (pgvector)", ["song_embeddings", "user_profiles"]],
];
const show = (v) => v === null || v === undefined ? "∅"
  : typeof v === "boolean" ? String(v)
  : typeof v === "object" ? JSON.stringify(v)
  : /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toLocaleString() : String(v);

export default function DatabaseExplorer() {
  const [cat, setCat] = useState(null); const [sel, setSel] = useState("listening_events");
  const [data, setData] = useState(null); const [live, setLive] = useState(true); const [at, setAt] = useState(null);
  const [fresh, setFresh] = useState(new Set()); const [bumped, setBumped] = useState(new Set()); const [error, setError] = useState("");
  const prevRows = useRef({ name: null, keys: new Set() }); const prevCounts = useRef({});

  const tick = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([
        fetch("/api/admin/db", { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/admin/db?name=${encodeURIComponent(sel)}`, { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (c.error || t.error) { setError(c.error || t.error); return; }
      setError("");
      // which counts changed since the last poll
      const b = new Set();
      for (const o of c.objects) { if (prevCounts.current[o.name] !== undefined && prevCounts.current[o.name] !== o.rows) b.add(o.name); prevCounts.current[o.name] = o.rows; }
      setBumped(b);
      // which rows are new since the last poll (same table only)
      const keyOf = (r) => JSON.stringify((t.key.length ? t.key : Object.keys(r)).map((k) => r[k]));
      const keys = new Set(t.rows.map(keyOf));
      const f = new Set(prevRows.current.name === t.name ? [...keys].filter((k) => !prevRows.current.keys.has(k)) : []);
      prevRows.current = { name: t.name, keys };
      setFresh(f); setCat(c); setData({ ...t, keyOf }); setAt(new Date());
    } catch { setError("Database unreachable"); }
  }, [sel]);

  useEffect(() => { prevRows.current = { name: null, keys: new Set() }; setData(null); tick(); }, [sel, tick]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") tick(); }, EVERY);
    return () => clearInterval(id);
  }, [live, tick]);

  const objs = cat?.objects || [];
  const byName = Object.fromEntries(objs.map((o) => [o.name, o]));
  const views = objs.filter((o) => o.kind === "view");
  const cur = byName[sel];
  const Item = ({ o }) => o ? (
    <button className={`dbitem ${sel === o.name ? "on" : ""} ${bumped.has(o.name) ? "bump" : ""}`} onClick={() => setSel(o.name)}>
      <span className="nm">{o.name}</span><span className="ct">{o.rows.toLocaleString()}</span>
    </button>) : null;

  return (<>
    <div className="card-h" style={{ marginBottom: 4 }}>
      <div>
        <h1 style={{ margin: 0 }}>Database explorer</h1>
        <p className="sub" style={{ margin: "4px 0 0" }}>
          {cat ? <>{cat.server} · database <b style={{ color: "var(--txt)" }}>{cat.database}</b> · extensions: {cat.extensions}</> : "Connecting…"}
        </p>
      </div>
      <div className="row">
        <span className={`livedot ${live && !error ? "on" : ""}`} />
        <span className="mut" style={{ fontSize: 13 }}>{error ? error : live ? `Live · refreshed ${at ? at.toLocaleTimeString() : "…"}` : "Paused"}</span>
        <button className="ghost" onClick={() => setLive(!live)}>{live ? "Pause" : "Resume"}</button>
        <Link className="btn ghost" href="/admin">Back to admin</Link>
      </div>
    </div>

    <div className="dbwrap">
      <aside className="card dbside">
        {GROUPS.map(([g, names]) => <div key={g}><div className="dbgroup">{g}</div>{names.map((n) => <Item key={n} o={byName[n]} />)}</div>)}
        {objs.filter((o) => o.kind === "table" && !GROUPS.some(([, ns]) => ns.includes(o.name))).map((o) => <Item key={o.name} o={o} />)}
        <div className="dbgroup">Views</div>
        {views.map((o) => <Item key={o.name} o={o} />)}
      </aside>

      <section className="card dbmain">
        <div className="card-h">
          <h3>{sel} <span className="tag" style={{ marginLeft: 8 }}>{cur?.kind || "…"}</span></h3>
          <span className="mut" style={{ fontSize: 13 }}>{cur ? `${cur.rows.toLocaleString()} rows · showing newest ${data?.rows.length ?? 0}` : ""}</span>
        </div>
        {cur && <div className="dbcols">{cur.columns.map((c) => <span key={c.name} className="dbcol">
          {c.pk && <b className="k pk">PK</b>}{c.fk && <b className="k fk">FK</b>}{c.name} <i>{c.type}</i></span>)}</div>}
        {!data ? <p className="mut">Loading…</p> : !data.rows.length ? <p className="mut">No rows yet.</p> :
          <div className="tablewrap dbtable"><table>
            <thead><tr>{data.columns.map((c) => <th key={c.name}>{c.name}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => { const k = data.keyOf(r); return (
              <tr key={k} className={fresh.has(k) ? "fresh" : ""}>
                {data.columns.map((c) => <td key={c.name} className={c.type === "vector" ? "vec" : ""} title={show(r[c.name])}>{show(r[c.name])}</td>)}
              </tr>); })}</tbody>
          </table></div>}
      </section>
    </div>
  </>);
}
