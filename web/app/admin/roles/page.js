"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton, toast } from "@/components/ui";

// Login/Group Roles: MoodTune's PostgreSQL roles, who belongs to which group, and what each may do.
// Everything shown is read live from PostgreSQL (pg_roles, pg_auth_members, has_table_privilege).
const PRIVS = [["sel", "SELECT"], ["ins", "INSERT"], ["upd", "UPDATE"], ["del", "DELETE"]];
const GROUP_INFO = {
  moodtune_admin: { label: "Admins", icon: "🛡️" },
  moodtune_listener: { label: "Listeners", icon: "🎧" },
  moodtune_restricted: { label: "Restricted (read-only)", icon: "🔒" },
};

function Cell({ v, onClick, title, disabled }) {
  const cls = v === "yes" ? "pv yes" : v === "cols" ? "pv cols" : "pv no";
  const sym = v === "yes" ? "✔" : v === "cols" ? "◐" : "✕";
  if (disabled) return <span className="pv na" title="Not applicable">—</span>;
  return onClick ? <button className={cls} onClick={onClick} title={title}>{sym}</button> : <span className={cls} title={title}>{sym}</span>;
}

export default function Roles() {
  const [d, setD] = useState(null); const [log, setLog] = useState([]);
  const [who, setWho] = useState(""); const [eff, setEff] = useState(null);
  const [obj, setObj] = useState("users"); const [priv, setPriv] = useState("SELECT"); const [probe, setProbe] = useState(null);
  const load = () => fetch("/api/admin/privileges", { cache: "no-store" }).then((r) => r.json()).then(setD);
  useEffect(() => { load(); }, []);
  const user = d?.users.find((u) => String(u.user_id) === String(who));
  useEffect(() => {
    setProbe(null);
    if (!user) { setEff(null); return; }
    fetch(`/api/admin/privileges?role=${encodeURIComponent(user.db_role)}`, { cache: "no-store" }).then((r) => r.json()).then(setEff);
  }, [who, d]);

  const post = (b) => fetch("/api/admin/privileges", { method: "POST", body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, ...(await r.json()) }));
  const addLog = (sql, ok = true) => setLog((l) => [{ sql, ok, at: new Date().toLocaleTimeString() }, ...l].slice(0, 30));

  const toggle = async (role, o, p, cur) => {
    const action = cur === "yes" ? "revoke" : "grant";
    const sql = action === "grant" ? `GRANT ${p} ON ${o} TO ${role}` : `REVOKE ${p} ON ${o} FROM ${role}`;
    if (!confirm(`Run this on PostgreSQL?\n\n${sql};`)) return;
    const r = await post({ action, role, object: o, privilege: p });
    if (r.ok) { addLog(r.sql); toast(`${action === "grant" ? "Granted" : "Revoked"} ${p} on ${o}`); } else toast(r.error, true);
    load();
  };
  const reset = async () => {
    if (!confirm("Reset both group roles to MoodTune's default privileges?")) return;
    const r = await post({ action: "reset" }); if (r.ok) { addLog(r.sql); toast("Default privileges restored"); } else toast(r.error, true);
    load();
  };
  const runProbe = async () => {
    setProbe({ busy: true });
    const r = await post({ action: "test", userId: user.user_id, object: obj, privilege: priv });
    setProbe(r.ok ? r : { error: r.error });
    if (r.ok) addLog(r.sql, r.allowed);
  };

  if (!d) return <><h1>Login/Group Roles</h1><Skeleton rows={5} /></>;
  const groups = d.groups.map((g) => g.name);
  const objs = d.matrix[groups[0]].privileges;
  const colInfo = (g, o, p) => d.matrix[g].columns.find((c) => c.table_name === o && c.privilege_type === p)?.columns;
  const counts = Object.fromEntries(groups.map((g) => [g, d.users.filter((u) => u.member_of?.includes(g)).length]));

  return (<>
    <div className="card-h">
      <div>
        <p className="mut" style={{ margin: 0, fontSize: 13 }}><Link href="/admin">← Admin console</Link></p>
        <h1 style={{ margin: "4px 0 0" }}>Login/Group Roles</h1>
      </div>
      <div className="row"><Link className="btn ghost" href="/admin/database">🗄️ Database explorer</Link>
        <button className="ghost" onClick={reset}>↺ Reset to defaults</button></div>
    </div>
    <p className="sub">Real PostgreSQL roles. <b>Group roles</b> hold privileges, every MoodTune user has a <b>login role</b> that is a member of one group,
      and every tick below is PostgreSQL's own answer (<code>has_table_privilege</code>). The same roles appear in pgAdmin under <i>Login/Group Roles</i>.</p>

    {/* ---------- group roles ---------- */}
    <div className="grid g2">
      {d.groups.map((g) => <div className="card" style={{ margin: 0 }} key={g.name}>
        <div className="card-h">
          <h3>{GROUP_INFO[g.name]?.icon} <code>{g.name}</code></h3>
          <span className="tag">group role · NOLOGIN</span>
        </div>
        <p className="mut" style={{ margin: "0 0 10px", fontSize: 13 }}>{g.comment}</p>
        <div className="mut" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>MEMBERS ({g.members.length})</div>
        <div className="chips">{g.members.length ? g.members.map((m) => <span className="chip" key={m}>{m}</span>) : <span className="dim">nobody</span>}</div>
      </div>)}
    </div>

    {/* ---------- who is what ---------- */}
    <div className="card">
      <h3>Who is what — login roles</h3>
      <p className="mut" style={{ marginTop: 0, fontSize: 13 }}>Created automatically by the <code>users_db_role_aiud</code> trigger on sign-up, moved between groups when an admin
        changes someone's role, and dropped when the user is deleted. <code>CONNECTION LIMIT 0</code>: they identify users inside PostgreSQL but can't open connections.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>MoodTune user</th><th>App role</th><th>PostgreSQL login role</th><th>Member of</th><th>Attributes</th><th /></tr></thead>
        <tbody>{d.users.map((u) => <tr key={u.user_id}>
          <td><div className="row" style={{ flexWrap: "nowrap" }}><span className="avatar">{u.username[0]}</span><b>{u.username}</b></div></td>
          <td>{u.app_role === "admin" ? <span className="role">admin</span> : u.app_role === "restricted" ? <span className="role ro">🔒 restricted</span> : <span className="mut">listener</span>}</td>
          <td><code>{u.db_role}</code>{!u.db_role_exists && <span className="err"> (missing)</span>}</td>
          <td>{u.member_of?.length ? u.member_of.map((m) => <span className="tag" key={m} style={{ marginRight: 4 }}>{m}</span>) : <span className="dim">—</span>}</td>
          <td className="mut" style={{ fontSize: 13 }}>{u.can_login ? "LOGIN" : "NOLOGIN"} · conn limit {u.connection_limit}</td>
          <td style={{ textAlign: "right" }}><button className="ghost" onClick={() => { setWho(String(u.user_id)); document.getElementById("check")?.scrollIntoView({ behavior: "smooth" }); }}>Check privileges</button></td>
        </tr>)}</tbody>
      </table></div>
      <p className="dim" style={{ fontSize: 12, margin: "8px 0 0" }}>Change someone's role in the Users table on the <Link href="/admin" style={{ textDecoration: "underline" }}>Admin console</Link> — their login role moves group automatically.</p>
    </div>

    {/* ---------- privilege matrix ---------- */}
    <div className="card">
      <div className="card-h"><h3>What each group can do</h3>
        <span className="mut" style={{ fontSize: 12 }}><span className="pv yes sm">✔</span> granted &nbsp; <span className="pv cols sm">◐</span> some columns only &nbsp; <span className="pv no sm">✕</span> not granted · click to GRANT / REVOKE</span></div>
      <div className="tablewrap"><table className="privtab">
        <thead>
          <tr><th rowSpan={2}>Table / view</th>{groups.map((g) => <th key={g} colSpan={4} className="grp">{GROUP_INFO[g]?.icon} {g} <span className="dim">({counts[g]} users)</span></th>)}</tr>
          <tr>{groups.map((g) => PRIVS.map(([, P]) => <th key={g + P} className="pc">{P}</th>))}</tr>
        </thead>
        <tbody>{objs.map((o, i) => <tr key={o.object_name}>
          <td><code>{o.object_name}</code>{o.object_kind === "view" && <span className="dim" style={{ fontSize: 12 }}> view</span>}</td>
          {groups.map((g) => { const row = d.matrix[g].privileges[i]; return PRIVS.map(([k, P]) => {
            const view = o.object_kind === "view" && P !== "SELECT";
            const cols = row[k] === "cols" ? colInfo(g, o.object_name, P) : null;
            return <td key={g + P} className="pc">
              <Cell v={row[k]} disabled={view} title={cols ? `Only columns: ${cols}` : `${row[k] === "yes" ? "REVOKE" : "GRANT"} ${P} ON ${o.object_name}${row.grantable && row[k] === "yes" ? " (WITH GRANT OPTION)" : ""}`}
                onClick={() => toggle(g, o.object_name, P, row[k])} />
            </td>; }); })}
        </tr>)}</tbody>
      </table></div>
    </div>

    {/* ---------- check a user ---------- */}
    <div className="card" id="check" style={{ scrollMarginTop: 80 }}>
      <h3>Check a user's privileges</h3>
      <div className="row">
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Choose a user…</option>
          {d.users.map((u) => <option key={u.user_id} value={u.user_id}>{u.username} ({u.app_role})</option>)}
        </select>
        {user && <span className="mut" style={{ fontSize: 13 }}>login role <code>{user.db_role}</code> inherits from <code>{user.member_of?.join(", ") || "nothing"}</code></span>}
      </div>

      {user && eff && <>
        <div className="row" style={{ marginTop: 14, padding: 12, border: "1px solid var(--line)", borderRadius: 12, background: "var(--bg2)" }}>
          <b style={{ fontSize: 14 }}>Try it as {user.username}:</b>
          <select value={priv} onChange={(e) => setPriv(e.target.value)}>{PRIVS.map(([, P]) => <option key={P}>{P}</option>)}</select>
          <span className="mut">on</span>
          <select value={obj} onChange={(e) => setObj(e.target.value)}>{objs.map((o) => <option key={o.object_name} value={o.object_name}>{o.object_name}{o.object_kind === "view" ? " (view)" : ""}</option>)}</select>
          <button onClick={runProbe} disabled={probe?.busy}>▶ Run as {user.db_role}</button>
          <span className="dim" style={{ fontSize: 12 }}>Runs inside a transaction that is always rolled back — nothing changes.</span>
        </div>
        {probe && !probe.busy && (probe.error ? <div className="banner">{probe.error}</div> : <div className={`probe ${probe.allowed ? "ok" : "bad"}`}>
          <pre>{probe.sql}</pre><div className="res">{probe.allowed ? "✔ " : "✕ "}{probe.message}</div></div>)}

        <h3 style={{ marginTop: 18 }}>Effective privileges of <code>{user.db_role}</code></h3>
        <div className="tablewrap"><table className="privtab">
          <thead><tr><th>Table / view</th>{PRIVS.map(([, P]) => <th key={P} className="pc">{P}</th>)}</tr></thead>
          <tbody>{eff.privileges.map((r) => <tr key={r.object_name}>
            <td><code>{r.object_name}</code>{r.object_kind === "view" && <span className="dim" style={{ fontSize: 12 }}> view</span>}</td>
            {PRIVS.map(([k, P]) => { const cols = eff.columns?.find((c) => c.table_name === r.object_name && c.privilege_type === P)?.columns;
              return <td key={P} className="pc"><Cell v={r[k]} disabled={r.object_kind === "view" && P !== "SELECT"} title={cols ? `Only columns: ${cols}` : undefined} /></td>; })}
          </tr>)}</tbody>
        </table></div>
      </>}
    </div>

    {/* ---------- SQL log ---------- */}
    {log.length > 0 && <div className="card"><h3>SQL run this session</h3>
      <pre className="log">{log.map((l) => `-- ${l.at}${l.ok ? "" : "  (permission denied)"}\n${l.sql}`).join("\n\n")}</pre></div>}
  </>);
}
