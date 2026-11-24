"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "./ui";

// The current user's ratings and playlists, loaded once per list/page and shared by every SongActions in it.
export function useLibrary(enabled = true) {
  const [fb, setFb] = useState({}); const [pls, setPls] = useState([]);
  const reloadPls = useCallback(() => fetch("/api/playlists").then((r) => r.json()).then((d) => Array.isArray(d) && setPls(d)).catch(() => {}), []);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/feedback").then((r) => r.json()).then((d) => d && !d.error && setFb(d)).catch(() => {});
    reloadPls();
  }, [enabled, reloadPls]);
  return { fb, setFb, pls, reloadPls };
}

const NEW = "__new__";

// Play · Like · Dislike · Add to playlist (incl. "New playlist…") · Similar
// variant="icon"   compact icon buttons for song lists
// variant="full"   labelled buttons for the song detail page
export default function SongActions({ song, lib, moodId = null, variant = "icon", similarHref, onSimilar }) {
  const { fb, setFb, pls, reloadPls } = lib;
  const id = song.song_id, rating = fb[id];
  const full = variant === "full";

  const rate = async (r) => {
    const v = rating === r ? 0 : r;
    const res = await fetch("/api/feedback", { method: "POST", body: JSON.stringify({ songId: id, rating: v }) });
    if (!res.ok) return toast((await res.json()).error || "Could not save rating", true);
    setFb((f) => ({ ...f, [id]: v || undefined }));
    reloadPls(); // a trigger just added/removed it in "♥ Liked songs"
    toast(v === 1 ? `❤️ Liked “${song.title}” — added to ♥ Liked songs` : v === -1 ? `👎 You won't see more like “${song.title}”` : "Rating removed");
  };
  const play = async () => {
    const res = await fetch("/api/play", { method: "POST", body: JSON.stringify({ songId: id, moodId }) });
    toast(res.ok ? `▶ Logged a play of “${song.title}”` : (await res.json().catch(() => ({}))).error || "Could not log the play", !res.ok);
  };
  const add = async (pid) => {
    if (!pid) return;
    if (pid === NEW) {
      const name = prompt("Name your new playlist", song.title.slice(0, 100)); if (!name?.trim()) return;
      const res = await fetch("/api/playlists", { method: "POST", body: JSON.stringify({ name: name.trim(), songIds: [id] }) });
      if (res.ok) { toast(`Created “${name.trim()}” with “${song.title}”`); reloadPls(); }
      else toast(res.status === 409 ? "You already have a playlist with that name" : (await res.json()).error, true);
      return;
    }
    const res = await fetch(`/api/playlists/${pid}`, { method: "POST", body: JSON.stringify({ songId: id }) });
    const name = pls.find((p) => String(p.playlist_id) === String(pid))?.name;
    if (res.ok) { toast(`Added to “${name}”`); reloadPls(); }
    else toast(res.status === 409 ? `Already in “${name}”` : (await res.json()).error, true);
  };

  const picker = (
    <select className={full ? "plpick full" : "plpick"} defaultValue="" title="Add to playlist"
      onChange={(e) => { const v = e.target.value; e.target.value = ""; add(v); }}>
      <option value="">{full ? "＋ Add to playlist" : "+ Playlist"}</option>
      {pls.filter((p) => !p.is_liked).map((p) => <option key={p.playlist_id} value={p.playlist_id}>{p.name}</option>)}
      <option value={NEW}>＋ New playlist…</option>
    </select>);
  const similar = onSimilar
    ? <button className="ghost" onClick={onSimilar} style={full ? undefined : { padding: "7px 12px" }}>{full ? "≈ Similar songs" : "Similar"}</button>
    : <Link className="btn ghost" href={similarHref || `/song/${id}`} style={full ? undefined : { padding: "7px 12px" }}>{full ? "≈ Similar songs" : "Similar"}</Link>;

  if (full) return (
    <div className="songacts">
      <button className="ghost" onClick={play}>▶ Play</button>
      <button className={`ghost ${rating === 1 ? "liked" : ""}`} onClick={() => rate(1)}>{rating === 1 ? "♥ Liked" : "♥ Like"}</button>
      <button className={`ghost ${rating === -1 ? "disliked" : ""}`} onClick={() => rate(-1)}>{rating === -1 ? "✕ Disliked" : "✕ Dislike"}</button>
      {picker}
      {similar}
    </div>);

  return (
    <div className="acts">
      <button className="icon" onClick={play} title="Log a play">▶</button>
      <button className={`icon ${rating === 1 ? "liked" : ""}`} onClick={() => rate(1)} title="Like">♥</button>
      <button className={`icon ${rating === -1 ? "disliked" : ""}`} onClick={() => rate(-1)} title="Dislike">✕</button>
      {picker}
      {similar}
    </div>);
}
