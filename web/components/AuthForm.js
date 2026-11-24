"use client";
import Link from "next/link";
import { useState } from "react";

export default function AuthForm({ mode }) {
  const signup = mode === "signup";
  const [f, setF] = useState({ username: "", email: "", password: "" });
  const [errs, setErrs] = useState({}); const [busy, setBusy] = useState(false); const [show, setShow] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault(); setErrs({}); setBusy(true);
    try {
      const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      if (r.ok) { window.location.href = "/"; return; }
      const d = await r.json().catch(() => ({}));
      setErrs(d.field ? { [d.field]: d.error } : { form: d.error || "Something went wrong" });
    } catch { setErrs({ form: "Could not reach the server" }); }
    setBusy(false);
  };
  const set = (k) => (ev) => { setF({ ...f, [k]: ev.target.value }); if (errs[k] || errs.form) setErrs({}); };

  return (
    <div className="auth-wrap">
      <div className="auth-art">
        <div className="pills"><span>⚡ Energetic</span><span>🌿 Calm</span><span>🔥 Tense</span><span>🌧️ Sad</span></div>
        <div>
          <h2>Music that matches<br />how you feel.</h2>
          <p>Pick a mood or a song you love — we find tracks that <i>feel</i> the same, using vector similarity over 20,000 songs.</p>
        </div>
      </div>
      <form className="auth" onSubmit={submit} noValidate>
        <h2>{signup ? "Create your account" : "Welcome back"}</h2>
        <p className="mut" style={{ margin: 0 }}>{signup ? "It takes less than a minute." : "Log in to continue discovering."}</p>

        {signup && <>
          <label className="f" htmlFor="u">Username</label>
          <input id="u" className={errs.username ? "bad" : ""} placeholder="e.g. melody_lover" value={f.username} onChange={set("username")} autoComplete="username" />
          {errs.username && <p className="err">{errs.username}</p>}
        </>}

        <label className="f" htmlFor="e">Email</label>
        <input id="e" className={errs.email ? "bad" : ""} type="email" placeholder="you@example.com" value={f.email} onChange={set("email")} autoComplete="email" />
        {errs.email && <p className="err">{errs.email}{signup && errs.email.includes("exists") && <> · <Link href="/login" style={{ textDecoration: "underline" }}>Log in</Link></>}</p>}

        <label className="f" htmlFor="p">Password</label>
        <div className="pw">
          <input id="p" className={errs.password ? "bad" : ""} type={show ? "text" : "password"} placeholder={signup ? "At least 8 characters" : "Your password"}
            value={f.password} onChange={set("password")} autoComplete={signup ? "new-password" : "current-password"} />
          <button type="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button>
        </div>
        {errs.password && <p className="err">{errs.password}</p>}

        {errs.form && <div className="banner">{errs.form}</div>}
        <button className="submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Log in"}</button>
        <p className="alt">{signup ? <>Already have an account? <Link href="/login">Log in</Link></> : <>New here? <Link href="/signup">Create an account</Link></>}</p>
        {!signup && <div className="demo">Demo accounts (password <code>password123</code>): <code>ishika@demo.com</code>, <code>arham@demo.com</code>, <code>admin@demo.com</code></div>}
      </form>
    </div>);
}
