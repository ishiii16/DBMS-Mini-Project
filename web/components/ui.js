"use client";
import { useEffect, useState } from "react";

// Visual metadata for each mood (colour comes from CSS class of the same name)
export const MOOD = {
  Energetic: { emoji: "⚡", desc: "Happy & high energy" },
  Calm: { emoji: "🌿", desc: "Happy & low energy" },
  Tense: { emoji: "🔥", desc: "Intense & high energy" },
  Sad: { emoji: "🌧️", desc: "Low mood & low energy" },
};

const initials = (t = "") => (t.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "♪").toUpperCase();

export function Cover({ title, mood, className = "" }) {
  return <div className={`cover ${mood || ""} ${className}`}>{initials(title)}</div>;
}

export function Meter({ value }) {
  if (value == null) return <div className="meter dim">—</div>;
  const v = Math.max(0, Math.min(1, +value));
  return <div className="meter"><div className="trk"><div className="fil" style={{ width: `${v * 100}%` }} /></div>{v.toFixed(2)}</div>;
}

export function Skeleton({ rows = 6 }) {
  return <>{Array.from({ length: rows }, (_, i) => <div key={i} className="sk" />)}</>;
}

export function Empty({ icon = "🎧", children }) {
  return <div className="empty"><div className="big">{icon}</div>{children}</div>;
}

// Tiny global toast: call toast("message") from anywhere
export const toast = (msg, bad = false) => window.dispatchEvent(new CustomEvent("mm-toast", { detail: { msg, bad } }));
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => {
    let timer;
    const on = (e) => { setT(e.detail); clearTimeout(timer); timer = setTimeout(() => setT(null), 2600); };
    window.addEventListener("mm-toast", on);
    return () => window.removeEventListener("mm-toast", on);
  }, []);
  return t ? <div className={`toast ${t.bad ? "bad" : ""}`}>{t.msg}</div> : null;
}

export function Bars({ rows, label, value = "plays", colorByMood = false }) {
  if (!rows?.length) return <p className="mut">No data yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r[value]));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className={`b ${colorByMood ? r[label] : ""}`} key={r[label] ?? "none"}>
          <span className="lbl">{colorByMood && MOOD[r[label]] ? `${MOOD[r[label]].emoji} ` : ""}{r[label] ?? "untagged"}</span>
          <div className="trk"><div className="fil" style={{ width: `${(100 * r[value]) / max}%`, ...(colorByMood && MOOD[r[label]] ? { background: "var(--c)" } : {}) }} /></div>
          <span className="val">{r[value]}</span>
        </div>
      ))}
    </div>
  );
}
