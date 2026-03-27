import { useState, useEffect, useCallback, useRef } from "react";

// ─────────────────────────────────────────────────────────────
//  CONFIG — update these to match your .env / Railway URL
// ─────────────────────────────────────────────────────────────
const API_BASE = (typeof window !== "undefined" && window.VOICEOS_API_BASE)
  ? window.VOICEOS_API_BASE
  : "http://localhost:3000/api";

const API_KEY = (typeof window !== "undefined" && window.VOICEOS_API_KEY)
  ? window.VOICEOS_API_KEY
  : "30eb8d91bcc21a80fbd51f00cc9272b71705d17fbd9f671ff46f580ce58c7caa";

// ─────────────────────────────────────────────────────────────
//  API LAYER
// ─────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const api = {
  get:    (path)         => apiFetch(path),
  post:   (path, body)   => apiFetch(path, { method: "POST",   body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch:  (path, body)   => apiFetch(path, { method: "PATCH",  body: JSON.stringify(body) }),
  delete: (path)         => apiFetch(path, { method: "DELETE" }),
};

// ─────────────────────────────────────────────────────────────
//  HOOKS
// ─────────────────────────────────────────────────────────────
function useApi(path, deps = []) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try   { setData(await api.get(path)); }
    catch (e) { setError(e.message); }
    finally   { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

// ─────────────────────────────────────────────────────────────
//  DESIGN TOKENS
// ─────────────────────────────────────────────────────────────
const COLOR = {
  bg:        "#0a0c0f",
  surface:   "#111318",
  card:      "#161b22",
  border:    "#21262d",
  borderHi:  "#30363d",
  accent:    "#f97316",   // Kerala saffron-orange
  accentDim: "#7c3a12",
  green:     "#22c55e",
  red:       "#ef4444",
  blue:      "#3b82f6",
  amber:     "#f59e0b",
  teal:      "#14b8a6",
  text:      "#e6edf3",
  textDim:   "#8b949e",
  textMuted: "#484f58",
};

const AGENT_COLORS = {
  amber: COLOR.amber,
  teal:  COLOR.teal,
  blue:  COLOR.blue,
  green: COLOR.green,
  red:   COLOR.red,
};

// ─────────────────────────────────────────────────────────────
//  SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────
function Badge({ label, color = COLOR.textDim, bg }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
      color, background: bg || color + "22", border: `1px solid ${color}44`,
    }}>{label}</span>
  );
}

function StatusDot({ status }) {
  const map = {
    active:      COLOR.green,
    idle:        COLOR.textDim,
    "in-progress": COLOR.amber,
    completed:   COLOR.teal,
    transferred: COLOR.blue,
    dropped:     COLOR.red,
    trained:     COLOR.green,
    training:    COLOR.amber,
    queued:      COLOR.textDim,
    error:       COLOR.red,
    available:   COLOR.teal,
  };
  const c = map[status] || COLOR.textDim;
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: c, boxShadow: status === "active" || status === "in-progress"
        ? `0 0 6px ${c}` : "none",
      animation: status === "in-progress" ? "pulse 1.5s ease-in-out infinite" : "none",
    }} />
  );
}

function Spinner() {
  return (
    <div style={{
      width: 20, height: 20, border: `2px solid ${COLOR.border}`,
      borderTop: `2px solid ${COLOR.accent}`, borderRadius: "50%",
      animation: "spin 0.7s linear infinite", display: "inline-block",
    }} />
  );
}

function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: COLOR.card, border: `1px solid ${COLOR.border}`,
      borderRadius: 12, padding: 20,
      cursor: onClick ? "pointer" : "default",
      transition: "border-color 0.15s, transform 0.15s",
      ...style,
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = COLOR.borderHi; e.currentTarget.style.transform = "translateY(-1px)"; }}}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.borderColor = COLOR.border;   e.currentTarget.style.transform = "translateY(0)"; }}}
    >{children}</div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled, style = {} }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.02em",
    opacity: disabled ? 0.5 : 1, transition: "all 0.15s",
    padding: size === "sm" ? "5px 12px" : size === "lg" ? "10px 22px" : "7px 16px",
    fontSize: size === "sm" ? 12 : 14,
  };
  const variants = {
    primary:  { background: COLOR.accent,   color: "#fff" },
    ghost:    { background: "transparent",  color: COLOR.textDim, border: `1px solid ${COLOR.border}` },
    danger:   { background: COLOR.red + "22", color: COLOR.red,   border: `1px solid ${COLOR.red}44` },
    success:  { background: COLOR.green + "22", color: COLOR.green, border: `1px solid ${COLOR.green}44` },
  };
  return (
    <button disabled={disabled} onClick={onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
    >{children}</button>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", multiline, rows = 3, style = {} }) {
  const inputStyle = {
    width: "100%", background: COLOR.surface, border: `1px solid ${COLOR.border}`,
    borderRadius: 8, padding: "8px 12px", color: COLOR.text, fontSize: 13,
    fontFamily: "inherit", outline: "none", resize: multiline ? "vertical" : "none",
    boxSizing: "border-box",
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      {label && <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.textDim, letterSpacing: "0.04em" }}>{label}</span>}
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={inputStyle} />
        : <input    value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={inputStyle} />
      }
    </label>
  );
}

function Select({ label, value, onChange, options, style = {} }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      {label && <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.textDim, letterSpacing: "0.04em" }}>{label}</span>}
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background: COLOR.surface, border: `1px solid ${COLOR.border}`,
        borderRadius: 8, padding: "8px 12px", color: COLOR.text,
        fontSize: 13, fontFamily: "inherit", outline: "none",
      }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? COLOR.accent : COLOR.border,
        position: "relative", transition: "background 0.2s", cursor: "pointer",
      }}>
        <div style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 13, color: COLOR.textDim }}>{label}</span>
    </label>
  );
}

function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(4px)",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: COLOR.card, border: `1px solid ${COLOR.border}`,
        borderRadius: 16, width, maxWidth: "95vw", maxHeight: "90vh",
        overflow: "auto", padding: 28, position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLOR.text }}>{title}</h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: COLOR.textDim,
            fontSize: 20, cursor: "pointer", padding: "2px 8px", borderRadius: 6,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const c = type === "error" ? COLOR.red : COLOR.green;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28, zIndex: 2000,
      background: COLOR.card, border: `1px solid ${c}44`,
      borderLeft: `3px solid ${c}`, borderRadius: 10,
      padding: "12px 18px", color: COLOR.text, fontSize: 13, fontWeight: 500,
      boxShadow: `0 8px 24px rgba(0,0,0,0.4)`,
      animation: "slideUp 0.25s ease",
    }}>
      <span style={{ marginRight: 8 }}>{type === "error" ? "⚠️" : "✓"}</span>
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ANALYTICS TAB
// ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const { data: summary, loading } = useApi("/analytics/summary");
  const { data: monthly }          = useApi("/analytics/monthly");

  if (loading) return <LoadingState label="Loading analytics…" />;

  const sentimentData = summary?.sentiments || {};
  const totalSent     = Object.values(sentimentData).reduce((a, b) => a + b, 0) || 1;

  const maxMonthly    = Math.max(...(monthly || []).map(m => +m.calls), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {[
          { label: "Total Calls",    value: summary?.totalCalls   ?? "—", icon: "📞", accent: COLOR.accent },
          { label: "Calls Today",    value: summary?.callsToday   ?? "—", icon: "📅", accent: COLOR.blue },
          { label: "Avg Duration",   value: summary?.avgDuration  ?? "—", icon: "⏱",  accent: COLOR.teal },
          { label: "Active Agents",  value: summary?.agents?.length ?? "—", icon: "🤖", accent: COLOR.green },
        ].map(kpi => (
          <Card key={kpi.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{kpi.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: kpi.accent, fontFamily: "'DM Mono', monospace" }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: COLOR.textDim, marginTop: 4, letterSpacing: "0.05em" }}>{kpi.label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Sentiment breakdown */}
        <Card>
          <h4 style={{ margin: "0 0 16px", fontSize: 13, color: COLOR.textDim, letterSpacing: "0.06em" }}>CALLER SENTIMENT</h4>
          {[
            { key: "positive", color: COLOR.green,  icon: "😊" },
            { key: "neutral",  color: COLOR.amber,  icon: "😐" },
            { key: "negative", color: COLOR.red,    icon: "😞" },
          ].map(({ key, color, icon }) => {
            const count = sentimentData[key] || 0;
            const pct   = Math.round((count / totalSent) * 100);
            return (
              <div key={key} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, color: COLOR.text }}>{icon} {key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  <span style={{ fontSize: 12, color: COLOR.textDim, fontFamily: "'DM Mono', monospace" }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 6, background: COLOR.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            );
          })}
        </Card>

        {/* Top intents */}
        <Card>
          <h4 style={{ margin: "0 0 16px", fontSize: 13, color: COLOR.textDim, letterSpacing: "0.06em" }}>TOP CALL INTENTS</h4>
          {(summary?.topIntents || []).length === 0
            ? <p style={{ color: COLOR.textMuted, fontSize: 13 }}>No intent data yet</p>
            : (summary?.topIntents || []).map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${COLOR.border}` }}>
                <span style={{ fontSize: 13, color: COLOR.text }}>{item.intent}</span>
                <Badge label={item.count} color={COLOR.accent} />
              </div>
            ))
          }
        </Card>
      </div>

      {/* Monthly chart */}
      <Card>
        <h4 style={{ margin: "0 0 16px", fontSize: 13, color: COLOR.textDim, letterSpacing: "0.06em" }}>MONTHLY CALL VOLUME</h4>
        {(monthly || []).length === 0
          ? <p style={{ color: COLOR.textMuted, fontSize: 13 }}>No monthly data yet</p>
          : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
              {monthly.map((m, i) => {
                const h   = Math.max(6, (m.calls / maxMonthly) * 90);
                const mon = new Date(m.month).toLocaleString("en", { month: "short" });
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 10, color: COLOR.textDim }}>{m.calls}</div>
                    <div style={{
                      width: "100%", height: h, background: COLOR.accent + "99",
                      border: `1px solid ${COLOR.accent}`, borderRadius: "4px 4px 0 0",
                      transition: "height 0.5s ease",
                    }} />
                    <div style={{ fontSize: 10, color: COLOR.textMuted }}>{mon}</div>
                  </div>
                );
              })}
            </div>
          )}
      </Card>

      {/* Agent leaderboard */}
      <Card>
        <h4 style={{ margin: "0 0 16px", fontSize: 13, color: COLOR.textDim, letterSpacing: "0.06em" }}>AGENT LEADERBOARD</h4>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: COLOR.textMuted, textAlign: "left" }}>
              {["Agent", "Region", "Total Calls", "Success Rate"].map(h => (
                <th key={h} style={{ padding: "6px 0", borderBottom: `1px solid ${COLOR.border}`, fontWeight: 600, letterSpacing: "0.04em", fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(summary?.agents || []).map((a, i) => (
              <tr key={a.id} style={{ borderBottom: `1px solid ${COLOR.border}` }}>
                <td style={{ padding: "10px 0", color: COLOR.text, fontWeight: 500 }}>
                  <span style={{ color: COLOR.textMuted, marginRight: 8 }}>#{i + 1}</span>{a.name}
                </td>
                <td style={{ color: COLOR.textDim }}>{a.region}</td>
                <td style={{ color: COLOR.accent, fontFamily: "'DM Mono', monospace" }}>{a.calls_total}</td>
                <td style={{ color: COLOR.green, fontFamily: "'DM Mono', monospace" }}>{a.success_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  AGENTS TAB
// ─────────────────────────────────────────────────────────────
function AgentForm({ agent, docs, onSave, onClose }) {
  const isEdit = !!agent;
  const [form, setForm] = useState({
    name:          agent?.name          || "",
    role:          agent?.role          || "Sales Agent",
    persona:       agent?.persona       || "Friendly Sales Lady",
    voice:         agent?.voice         || "South Kerala",
    region:        agent?.region        || "South Kerala",
    greeting:      agent?.greeting      || "",
    system_prompt: agent?.system_prompt || "",
    number:        agent?.number        || "",
    temperature:   agent?.temperature   || 0.8,
    max_duration:  agent?.max_duration  || 300,
    end_silence:   agent?.end_silence   || 2,
    color:         agent?.color         || "amber",
    interruption:  agent?.interruption  ?? true,
    auto_intent:   agent?.auto_intent   ?? true,
    crm_capture:   agent?.crm_capture   ?? true,
    escalation:    agent?.escalation    ?? true,
    docs:          agent?.docs          || [],
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.greeting || !form.system_prompt) {
      alert("Name, Greeting and System Prompt are required.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/agents/${agent.id}`, form);
      else        await api.post("/agents", form);
      onSave();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const regions = ["South Kerala", "Central Kerala", "North Kerala", "Kochi Urban"];
  const colors  = ["amber", "teal", "blue", "green", "red"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Agent Name *"  value={form.name}    onChange={v => set("name", v)}    placeholder="Lakshmi" />
        <Input label="Role"          value={form.role}    onChange={v => set("role", v)}    placeholder="Sales Agent" />
        <Input label="Persona"       value={form.persona} onChange={v => set("persona", v)} placeholder="Friendly Sales Lady" />
        <Select label="Region" value={form.region} onChange={v => set("region", v)}
          options={regions.map(r => ({ value: r, label: r }))} />
        <Input label="Voice Profile" value={form.voice}   onChange={v => set("voice", v)}   placeholder="South Kerala" />
        <Input label="Phone Number"  value={form.number}  onChange={v => set("number", v)}  placeholder="+918045678901" />
      </div>

      <Input label="Greeting (Malayalam) *" value={form.greeting}
        onChange={v => set("greeting", v)} multiline rows={2}
        placeholder="നമസ്കാരം! ഞാൻ ലക്ഷ്മി..." />

      <Input label="System Prompt *" value={form.system_prompt}
        onChange={v => set("system_prompt", v)} multiline rows={4}
        placeholder="You are Lakshmi, a friendly sales agent for Kerala Paints..." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Temperature (0–1)" value={form.temperature} type="number"
          onChange={v => set("temperature", parseFloat(v))} />
        <Input label="Max Duration (s)" value={form.max_duration} type="number"
          onChange={v => set("max_duration", parseInt(v))} />
        <Input label="End Silence (s)" value={form.end_silence} type="number"
          onChange={v => set("end_silence", parseInt(v))} />
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLOR.textDim, marginBottom: 8, letterSpacing: "0.04em" }}>COLOR THEME</div>
        <div style={{ display: "flex", gap: 8 }}>
          {colors.map(c => (
            <div key={c} onClick={() => set("color", c)} style={{
              width: 28, height: 28, borderRadius: "50%",
              background: AGENT_COLORS[c] || COLOR.textDim,
              border: form.color === c ? `3px solid ${COLOR.text}` : `3px solid transparent`,
              cursor: "pointer",
            }} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: COLOR.surface, borderRadius: 10, padding: 14 }}>
        <Toggle label="Interruption allowed" checked={form.interruption} onChange={v => set("interruption", v)} />
        <Toggle label="Auto intent detection" checked={form.auto_intent} onChange={v => set("auto_intent", v)} />
        <Toggle label="CRM capture" checked={form.crm_capture} onChange={v => set("crm_capture", v)} />
        <Toggle label="Human escalation" checked={form.escalation} onChange={v => set("escalation", v)} />
      </div>

      {docs?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLOR.textDim, marginBottom: 8, letterSpacing: "0.04em" }}>KNOWLEDGE DOCS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {docs.filter(d => d.status === "trained").map(d => (
              <div key={d.id} onClick={() => {
                const selected = form.docs.includes(d.id)
                  ? form.docs.filter(x => x !== d.id)
                  : [...form.docs, d.id];
                set("docs", selected);
              }} style={{
                padding: "4px 10px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                background: form.docs.includes(d.id) ? COLOR.accent + "33" : COLOR.surface,
                border: `1px solid ${form.docs.includes(d.id) ? COLOR.accent : COLOR.border}`,
                color: form.docs.includes(d.id) ? COLOR.accent : COLOR.textDim,
              }}>{d.name}</div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 6 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : (isEdit ? "Save Changes" : "Create Agent")}
        </Btn>
      </div>
    </div>
  );
}

function AgentsTab({ toast }) {
  const { data: agents, loading, reload } = useApi("/agents");
  const { data: docs }                    = useApi("/documents");
  const [modal, setModal]   = useState(null); // null | "create" | agent object
  const [deleting, setDel]  = useState(null);

  const handleDelete = async (agent) => {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;
    setDel(agent.id);
    try {
      await api.delete(`/agents/${agent.id}`);
      toast("Agent deleted");
      reload();
    } catch (e) { toast(e.message, "error"); }
    finally { setDel(null); }
  };

  if (loading) return <LoadingState label="Loading agents…" />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Voice Agents</h2>
          <p style={{ margin: "4px 0 0", color: COLOR.textDim, fontSize: 13 }}>{agents?.length || 0} agents configured</p>
        </div>
        <Btn onClick={() => setModal("create")}>＋ New Agent</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {(agents || []).map(agent => {
          const accentColor = AGENT_COLORS[agent.color] || COLOR.amber;
          return (
            <Card key={agent.id} style={{ borderLeft: `3px solid ${accentColor}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <StatusDot status={agent.status} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: COLOR.text }}>{agent.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLOR.textDim }}>{agent.role} · {agent.region}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn size="sm" variant="ghost" onClick={() => setModal(agent)}>Edit</Btn>
                  <Btn size="sm" variant="danger" disabled={deleting === agent.id} onClick={() => handleDelete(agent)}>
                    {deleting === agent.id ? <Spinner /> : "Del"}
                  </Btn>
                </div>
              </div>

              <div style={{ fontSize: 12, color: COLOR.textDim, background: COLOR.surface, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontStyle: "italic", lineHeight: 1.5 }}>
                "{agent.greeting?.slice(0, 90)}{agent.greeting?.length > 90 ? "…" : ""}"
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {agent.number && <Badge label={agent.number} color={COLOR.teal} />}
                <Badge label={`🌡 ${agent.temperature}`} />
                <Badge label={`⏱ ${Math.floor(agent.max_duration / 60)}m max`} />
                {agent.escalation && <Badge label="Escalation" color={COLOR.blue} />}
              </div>

              <div style={{ display: "flex", gap: 12, fontSize: 12, color: COLOR.textDim, paddingTop: 10, borderTop: `1px solid ${COLOR.border}` }}>
                <span>📞 {agent.calls_total} calls</span>
                <span>✓ {agent.success_rate}% success</span>
                <span style={{ marginLeft: "auto", color: accentColor }}>
                  {agent.docs?.length || 0} docs
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {modal && (
        <Modal
          title={modal === "create" ? "New Voice Agent" : `Edit: ${modal.name}`}
          onClose={() => setModal(null)}
          width={640}
        >
          <AgentForm
            agent={modal === "create" ? null : modal}
            docs={docs || []}
            onSave={() => { setModal(null); reload(); toast(modal === "create" ? "Agent created" : "Agent updated"); }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  CALLS TAB
// ─────────────────────────────────────────────────────────────
function CallTranscript({ callId, onClose }) {
  const { data: call, loading } = useApi(`/calls/${callId}`);

  if (loading) return (
    <Modal title="Call Details" onClose={onClose}>
      <LoadingState label="Loading transcript…" />
    </Modal>
  );
  if (!call) return null;

  const roleStyle = {
    agent:    { align: "flex-start", bg: COLOR.surface,        color: COLOR.text },
    caller:   { align: "flex-end",   bg: COLOR.accent + "22",  color: COLOR.text },
    stt_full: { align: "flex-start", bg: COLOR.blue + "15",    color: COLOR.textDim },
  };

  return (
    <Modal title={`📞 ${call.caller} · ${call.duration}`} onClose={onClose} width={580}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Badge label={call.status} color={call.status === "completed" ? COLOR.green : COLOR.amber} />
        {call.intent    && <Badge label={call.intent}    color={COLOR.blue} />}
        {call.sentiment && <Badge label={call.sentiment} color={
          call.sentiment === "positive" ? COLOR.green :
          call.sentiment === "negative" ? COLOR.red : COLOR.amber
        } />}
        {call.region && <Badge label={call.region} />}
      </div>

      {call.summary && (
        <div style={{ background: COLOR.surface, borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: COLOR.textDim, lineHeight: 1.6 }}>
          <strong style={{ color: COLOR.text }}>AI Summary: </strong>{call.summary}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 400, overflowY: "auto" }}>
        {(call.transcript || []).filter(t => t.role !== "stt_full").map((t, i) => {
          const rs = roleStyle[t.role] || roleStyle.agent;
          return (
            <div key={i} style={{ display: "flex", justifyContent: rs.align }}>
              <div style={{
                maxWidth: "80%", padding: "8px 12px", borderRadius: 10,
                background: rs.bg, color: rs.color,
                fontSize: 13, lineHeight: 1.5,
                border: `1px solid ${COLOR.border}`,
              }}>
                <div style={{ fontSize: 10, color: COLOR.textMuted, marginBottom: 4, letterSpacing: "0.04em" }}>
                  {t.role === "agent" ? "🤖 AGENT" : "👤 CALLER"}
                </div>
                {t.text}
              </div>
            </div>
          );
        })}
      </div>

      {call.recording_url && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLOR.border}` }}>
          <a href={call.recording_url} target="_blank" rel="noreferrer" style={{ color: COLOR.accent, fontSize: 13, textDecoration: "none" }}>
            🎙 Play Recording ↗
          </a>
        </div>
      )}
    </Modal>
  );
}

function CallsTab() {
  const [filters, setFilters] = useState({ status: "", agentId: "", limit: 50 });
  const { data: agents }      = useApi("/agents");
  const [viewCallId, setView] = useState(null);

  const queryString = Object.entries(filters)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const { data: calls, loading, reload } = useApi(`/calls?${queryString}`, [queryString]);

  const sentimentColor = s =>
    s === "positive" ? COLOR.green : s === "negative" ? COLOR.red : COLOR.textDim;

  const statusColor = s => ({
    completed:   COLOR.green,
    "in-progress": COLOR.amber,
    transferred: COLOR.blue,
    dropped:     COLOR.red,
  }[s] || COLOR.textDim);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Call Logs</h2>
          <p style={{ margin: "4px 0 0", color: COLOR.textDim, fontSize: 13 }}>{calls?.length || 0} calls</p>
        </div>
        <Btn variant="ghost" onClick={reload}>↻ Refresh</Btn>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Select value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}
          options={[
            { value: "", label: "All statuses" },
            { value: "completed",    label: "Completed" },
            { value: "in-progress",  label: "In Progress" },
            { value: "transferred",  label: "Transferred" },
            { value: "dropped",      label: "Dropped" },
          ]} style={{ minWidth: 150 }} />
        <Select value={filters.agentId} onChange={v => setFilters(f => ({ ...f, agentId: v }))}
          options={[
            { value: "", label: "All agents" },
            ...(agents || []).map(a => ({ value: a.id, label: a.name })),
          ]} style={{ minWidth: 150 }} />
        <Select value={String(filters.limit)} onChange={v => setFilters(f => ({ ...f, limit: v }))}
          options={[
            { value: "20", label: "Show 20" },
            { value: "50", label: "Show 50" },
            { value: "100", label: "Show 100" },
          ]} style={{ minWidth: 120 }} />
      </div>

      {loading ? <LoadingState label="Loading calls…" /> : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: COLOR.surface }}>
                {["Caller", "Agent", "Duration", "Status", "Intent", "Sentiment", "Region", "Time", ""].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: "left", color: COLOR.textMuted,
                    fontWeight: 600, fontSize: 11, letterSpacing: "0.05em",
                    borderBottom: `1px solid ${COLOR.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(calls || []).map(call => (
                <tr key={call.id} style={{ borderBottom: `1px solid ${COLOR.border}` }}
                  onMouseEnter={e => e.currentTarget.style.background = COLOR.surface}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "10px 14px", color: COLOR.text, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{call.caller}</td>
                  <td style={{ padding: "10px 14px", color: COLOR.textDim }}>{call.agent_name}</td>
                  <td style={{ padding: "10px 14px", color: COLOR.text, fontFamily: "'DM Mono', monospace" }}>{call.duration}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <StatusDot status={call.status} />
                      <span style={{ color: statusColor(call.status), fontSize: 12 }}>{call.status}</span>
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", color: COLOR.textDim, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{call.intent || "—"}</td>
                  <td style={{ padding: "10px 14px", color: sentimentColor(call.sentiment) }}>{call.sentiment || "—"}</td>
                  <td style={{ padding: "10px 14px", color: COLOR.textDim }}>{call.region || "—"}</td>
                  <td style={{ padding: "10px 14px", color: COLOR.textMuted, fontSize: 11 }}>
                    {call.started_at ? new Date(call.started_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <Btn size="sm" variant="ghost" onClick={() => setView(call.id)}>View</Btn>
                  </td>
                </tr>
              ))}
              {(calls || []).length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: COLOR.textMuted }}>No calls found</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {viewCallId && <CallTranscript callId={viewCallId} onClose={() => setView(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  DOCUMENTS TAB
// ─────────────────────────────────────────────────────────────
function DocumentsTab({ toast }) {
  const { data: docs, loading, reload } = useApi("/documents");
  const [uploading, setUploading]       = useState(false);
  const [training, setTraining]         = useState(null);
  const fileRef                         = useRef();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/documents/upload", form);
      toast("Document uploaded — ready to train");
      reload();
    } catch (err) { toast(err.message, "error"); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const handleTrain = async (doc) => {
    setTraining(doc.id);
    try {
      await api.post(`/documents/${doc.id}/train`, {});
      toast("Training started…");
      setTimeout(reload, 5000); // poll once after expected training time
    } catch (err) { toast(err.message, "error"); }
    finally { setTraining(null); }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      toast("Document deleted");
      reload();
    } catch (err) { toast(err.message, "error"); }
  };

  const statusColor = { trained: COLOR.green, training: COLOR.amber, queued: COLOR.textDim, error: COLOR.red };

  if (loading) return <LoadingState label="Loading documents…" />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Knowledge Base</h2>
          <p style={{ margin: "4px 0 0", color: COLOR.textDim, fontSize: 13 }}>Documents that train your agents</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv"
            style={{ display: "none" }} onChange={handleUpload} />
          <Btn onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : "⬆ Upload Document"}
          </Btn>
        </div>
      </div>

      {/* Upload zone */}
      <div style={{
        border: `2px dashed ${COLOR.border}`, borderRadius: 12,
        padding: 24, textAlign: "center", marginBottom: 20, cursor: "pointer",
        transition: "border-color 0.2s",
      }}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = COLOR.accent; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = COLOR.border; }}
        onDrop={async e => {
          e.preventDefault();
          e.currentTarget.style.borderColor = COLOR.border;
          const file = e.dataTransfer.files[0];
          if (!file) return;
          setUploading(true);
          try {
            const form = new FormData(); form.append("file", file);
            await api.post("/documents/upload", form);
            toast("Document uploaded"); reload();
          } catch (err) { toast(err.message, "error"); }
          finally { setUploading(false); }
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
        <div style={{ color: COLOR.textDim, fontSize: 13 }}>
          Drag & drop or click to upload · PDF, DOC, TXT, CSV supported
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(docs || []).map(doc => (
          <Card key={doc.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
            <div style={{ fontSize: 28 }}>{doc.type === "pdf" ? "📕" : "📝"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: COLOR.text, fontSize: 14, marginBottom: 2 }}>{doc.name}</div>
              <div style={{ fontSize: 12, color: COLOR.textDim }}>
                {doc.size} · {doc.chunks} chunks · uploaded {new Date(doc.uploaded_at).toLocaleDateString("en-IN")}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: statusColor[doc.status] || COLOR.textDim }}>
                <StatusDot status={doc.status} />{doc.status}
              </span>
              {doc.status !== "trained" && doc.status !== "training" && (
                <Btn size="sm" variant="success" disabled={training === doc.id} onClick={() => handleTrain(doc)}>
                  {training === doc.id ? <Spinner /> : "▶ Train"}
                </Btn>
              )}
              <Btn size="sm" variant="danger" onClick={() => handleDelete(doc)}>Delete</Btn>
            </div>
          </Card>
        ))}
        {(docs || []).length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: COLOR.textMuted }}>No documents uploaded yet</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  PHONE NUMBERS TAB
// ─────────────────────────────────────────────────────────────
function NumbersTab({ toast }) {
  const { data: numbers, loading, reload } = useApi("/numbers");
  const { data: agents }                   = useApi("/agents");
  const [addForm, setAddForm]              = useState(null);
  const [newNum, setNewNum]                = useState({ number: "", region: "", agentId: "" });

  const handleAdd = async () => {
    if (!newNum.number) return toast("Phone number is required", "error");
    try {
      await api.post("/numbers", newNum);
      toast("Phone number added");
      setAddForm(null);
      setNewNum({ number: "", region: "", agentId: "" });
      reload();
    } catch (err) { toast(err.message, "error"); }
  };

  const handleAssign = async (numId, agentId) => {
    try {
      await api.patch(`/numbers/${numId}`, { agentId: agentId || null });
      toast("Assignment updated");
      reload();
    } catch (err) { toast(err.message, "error"); }
  };

  const handleDelete = async (num) => {
    if (!confirm(`Remove number ${num.number}?`)) return;
    try {
      await api.delete(`/numbers/${num.id}`);
      toast("Number removed");
      reload();
    } catch (err) { toast(err.message, "error"); }
  };

  if (loading) return <LoadingState label="Loading numbers…" />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Phone Numbers</h2>
          <p style={{ margin: "4px 0 0", color: COLOR.textDim, fontSize: 13 }}>{numbers?.length || 0} numbers · assign to agents</p>
        </div>
        <Btn onClick={() => setAddForm(true)}>＋ Add Number</Btn>
      </div>

      {addForm && (
        <Card style={{ marginBottom: 16, borderColor: COLOR.accent + "55" }}>
          <h4 style={{ margin: "0 0 14px", fontSize: 14, color: COLOR.text }}>Add Phone Number</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <Input label="Phone Number *" value={newNum.number} onChange={v => setNewNum(n => ({ ...n, number: v }))} placeholder="+918045678901" />
            <Input label="Region" value={newNum.region} onChange={v => setNewNum(n => ({ ...n, region: v }))} placeholder="South Kerala" />
            <Select label="Assign to Agent" value={newNum.agentId} onChange={v => setNewNum(n => ({ ...n, agentId: v }))}
              options={[{ value: "", label: "Unassigned" }, ...(agents || []).map(a => ({ value: a.id, label: a.name }))]} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={handleAdd}>Add Number</Btn>
            <Btn variant="ghost" onClick={() => setAddForm(null)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(numbers || []).map(num => (
          <Card key={num.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px" }}>
            <div style={{ fontSize: 22 }}>📱</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLOR.text, fontFamily: "'DM Mono', monospace" }}>{num.number}</div>
              <div style={{ fontSize: 12, color: COLOR.textDim, marginTop: 2 }}>
                {num.region !== "—" ? num.region : "No region"} · {num.type} · {num.calls_total} calls
              </div>
            </div>
            <div style={{ minWidth: 180 }}>
              <Select value={num.agent_id || ""} onChange={v => handleAssign(num.id, v)}
                options={[{ value: "", label: "Unassigned" }, ...(agents || []).map(a => ({ value: a.id, label: a.name }))]} />
            </div>
            <Badge
              label={num.status}
              color={num.status === "active" ? COLOR.green : COLOR.textDim}
            />
            <Btn size="sm" variant="danger" onClick={() => handleDelete(num)}>Remove</Btn>
          </Card>
        ))}
        {(numbers || []).length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: COLOR.textMuted }}>No phone numbers added yet</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  SETTINGS TAB
// ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [apiBase, setApiBase] = useState(API_BASE);
  const [apiKey,  setApiKey]  = useState(API_KEY);
  const [saved,   setSaved]   = useState(false);

  const handleSave = () => {
    if (typeof window !== "undefined") {
      window.VOICEOS_API_BASE = apiBase;
      window.VOICEOS_API_KEY  = apiKey;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>Settings</h2>
      <p style={{ margin: "0 0 24px", color: COLOR.textDim, fontSize: 13 }}>Connect to your Railway backend</p>

      <Card style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 16px", fontSize: 14, color: COLOR.text }}>🔌 Backend Connection</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="API Base URL" value={apiBase} onChange={setApiBase}
            placeholder="https://your-app.up.railway.app/api" />
          <Input label="API Secret Key" value={apiKey} onChange={setApiKey}
            type="password" placeholder="your-api-secret-here" />
        </div>
        <div style={{ marginTop: 16 }}>
          <Btn onClick={handleSave} variant={saved ? "success" : "primary"}>
            {saved ? "✓ Saved" : "Save Connection"}
          </Btn>
        </div>
      </Card>

      <Card>
        <h4 style={{ margin: "0 0 14px", fontSize: 14, color: COLOR.text }}>📋 Integration Guide</h4>
        <div style={{ fontSize: 13, color: COLOR.textDim, lineHeight: 1.8 }}>
          <p style={{ margin: "0 0 10px" }}>To embed this dashboard in your website, add before the script tag:</p>
          <pre style={{
            background: COLOR.surface, borderRadius: 8, padding: 14,
            fontSize: 12, color: COLOR.text, overflow: "auto", lineHeight: 1.6,
          }}>{`<script>
  window.VOICEOS_API_BASE = "${apiBase}";
  window.VOICEOS_API_KEY  = "your-secret";
</script>`}</pre>
          <p style={{ margin: "12px 0 0" }}>All headers, rate limits and CORS are handled by your Express server.</p>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  SHARED
// ─────────────────────────────────────────────────────────────
function LoadingState({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: 60, color: COLOR.textDim, fontSize: 14 }}>
      <Spinner />{label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────────────────────
const TABS = [
  { id: "analytics", label: "Analytics",    icon: "📊" },
  { id: "agents",    label: "Agents",        icon: "🤖" },
  { id: "calls",     label: "Call Logs",     icon: "📞" },
  { id: "documents", label: "Knowledge",     icon: "📚" },
  { id: "numbers",   label: "Phone Numbers", icon: "📱" },
  { id: "settings",  label: "Settings",      icon: "⚙️"  },
];

export default function VoiceOSDashboard() {
  const [tab,   setTab]   = useState("analytics");
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type, id: Date.now() });
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Noto+Sans+Malayalam:wght@400;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${COLOR.bg}; color: ${COLOR.text}; font-family: 'Syne', sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${COLOR.bg}; }
        ::-webkit-scrollbar-thumb { background: ${COLOR.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${COLOR.borderHi}; }
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes slideUp { from { transform:translateY(12px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
        input:focus, textarea:focus, select:focus {
          border-color: ${COLOR.accent} !important;
          box-shadow: 0 0 0 2px ${COLOR.accent}22;
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: 220, flexShrink: 0, background: COLOR.surface,
          borderRight: `1px solid ${COLOR.border}`,
          display: "flex", flexDirection: "column", padding: "20px 0",
          position: "sticky", top: 0, height: "100vh",
        }}>
          {/* Logo */}
          <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${COLOR.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `linear-gradient(135deg, ${COLOR.accent}, ${COLOR.accentDim})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>🎙</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.02em" }}>VoiceOS</div>
                <div style={{ fontSize: 10, color: COLOR.textDim, letterSpacing: "0.06em" }}>MALAYALAM IVR</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: "16px 10px" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "9px 12px", borderRadius: 8,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                fontWeight: tab === t.id ? 700 : 500, fontSize: 13,
                background: tab === t.id ? COLOR.accent + "22" : "transparent",
                color: tab === t.id ? COLOR.accent : COLOR.textDim,
                borderLeft: tab === t.id ? `3px solid ${COLOR.accent}` : "3px solid transparent",
                transition: "all 0.15s", textAlign: "left",
              }}
                onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = COLOR.text; }}
                onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = COLOR.textDim; }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${COLOR.border}` }}>
            <div style={{ fontSize: 11, color: COLOR.textMuted, lineHeight: 1.6 }}>
              Kerala Paints<br />
              <span style={{ color: COLOR.accent }}>●</span> IVR Platform v1.0
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <main style={{ flex: 1, padding: "28px 32px", overflow: "auto", animation: "fadeIn 0.2s ease" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
                {TABS.find(t => t.id === tab)?.icon} {TABS.find(t => t.id === tab)?.label}
              </h1>
            </div>
            <div style={{ fontSize: 12, color: COLOR.textMuted, textAlign: "right" }}>
              <div style={{ fontFamily: "'DM Mono', monospace" }}>{new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
              <div style={{ marginTop: 2, color: COLOR.textMuted }}>Kerala Standard Time</div>
            </div>
          </div>

          {/* Tab content */}
          {tab === "analytics" && <AnalyticsTab />}
          {tab === "agents"    && <AgentsTab    toast={showToast} />}
          {tab === "calls"     && <CallsTab />}
          {tab === "documents" && <DocumentsTab toast={showToast} />}
          {tab === "numbers"   && <NumbersTab   toast={showToast} />}
          {tab === "settings"  && <SettingsTab />}
        </main>
      </div>

      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
