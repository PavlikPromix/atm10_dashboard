import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Bell,
  Boxes,
  CheckCircle2,
  Copy,
  Database,
  Droplets,
  FlaskConical,
  Gauge,
  Layers3,
  Play,
  Plus,
  Power,
  Save,
  Server,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { eventsUrl, getHistory, getLatest, login, saveConfig, sendCommand } from "./lib/api";
import "./styles.css";

type View = "overview" | "items" | "fluids" | "chemicals" | "autocraft" | "settings";

type AutocraftRule = {
  enabled?: boolean;
  label?: string;
  source?: string;
  target?: string;
  sourcePerCraft?: number;
  outputPerCraft?: number;
  fixedReserve?: number;
  minOutputsPerJob?: number;
  maxOutputsPerJob?: number;
  roundTo?: number;
  targetLimit?: number;
  reservePercent?: number;
  reserveMin?: number;
  reserveMax?: number;
  targetNbt?: string;
  targetFingerprint?: string;
  [key: string]: unknown;
};

const views: Array<{ id: View; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Gauge size={17} /> },
  { id: "items", label: "Items", icon: <Boxes size={17} /> },
  { id: "fluids", label: "Fluids", icon: <Droplets size={17} /> },
  { id: "chemicals", label: "Chemicals", icon: <FlaskConical size={17} /> },
  { id: "autocraft", label: "Autocraft", icon: <Layers3 size={17} /> },
  { id: "settings", label: "Settings", icon: <Settings size={17} /> },
];

const defaultRule: AutocraftRule = {
  enabled: true,
  label: "",
  source: "",
  target: "",
  sourcePerCraft: 8,
  outputPerCraft: 1,
  fixedReserve: 0,
};

function formatNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function formatCompact(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function percent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return `${Math.round(n * 1000) / 10}%`;
}

function cls(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await login(username, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main className="login-shell">
      <form className="login-panel" onSubmit={submit}>
        <div className="login-mark"><Server size={30} /></div>
        <div>
          <p className="eyebrow">Refined Storage</p>
          <h1>ATM10 Dashboard</h1>
        </div>
        <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <input autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">Sign in</button>
      </form>
    </main>
  );
}

function Chart({ points, tone = "mint" }: { points: Array<{ createdAt: string; value: number }>; tone?: "mint" | "blue" | "violet" | "amber" }) {
  const { line, area } = useMemo(() => {
    const values = points.map((p) => Number(p.value)).filter(Number.isFinite);
    if (values.length < 2) return { line: "", area: "" };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const path = values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = 100 - ((value - min) / span) * 82 - 8;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
    return { line: path, area: `${path} L 100 100 L 0 100 Z` };
  }, [points]);

  return (
    <svg className={cls("chart", `chart-${tone}`)} viewBox="0 0 100 100" preserveAspectRatio="none">
      {area && <path className="chart-area" d={area} />}
      {line && <path className="chart-line" d={line} />}
    </svg>
  );
}

function MetricCard({ icon, label, value, detail, percentValue, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; percentValue?: number; tone: string }) {
  return (
    <section className={cls("card", "metric-card", tone)}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      {percentValue !== undefined && (
        <div className="bar">
          <span style={{ width: `${Number.isFinite(percentValue) ? Math.min(percentValue * 100, 100) : 0}%` }} />
        </div>
      )}
    </section>
  );
}

function TrendPanel({ title, metric, category, tone }: { title: string; metric: string; category?: string; tone?: "mint" | "blue" | "violet" | "amber" }) {
  const [range, setRange] = useState("24h");
  const [points, setPoints] = useState<Array<{ createdAt: string; value: number }>>([]);

  useEffect(() => {
    getHistory(metric, category, range).then((data) => setPoints(data.points)).catch(() => setPoints([]));
  }, [category, metric, range]);

  return (
    <section className="card trend-card">
      <div className="toolbar compact">
        <h3>{title}</h3>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="1h">1h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <Chart points={points} tone={tone} />
    </section>
  );
}

function Overview({ snapshot, config, setView }: { snapshot: any; config: any; setView: (view: View) => void }) {
  const storages = snapshot?.storages ?? [];
  const item = storages.find((storage: any) => storage.key === "Item") ?? storages[0];
  const fluid = storages.find((storage: any) => storage.key === "Fluid");
  const chemical = storages.find((storage: any) => storage.key === "Chemical");
  const autocraft = snapshot?.autocraft ?? config?.value?.autocraft;
  const rows = autocraft?.rows ?? [];
  const enabledRules = rows.length
    ? rows.filter((row: any) => row.enabled).length
    : (config?.value?.autocraft?.rules ?? []).filter((rule: any) => rule.enabled !== false).length;
  const growing = snapshot?.topGrowing ?? [];
  const alerts = snapshot?.alerts ?? [];

  return (
    <div className="dashboard-grid">
      <MetricCard icon={<Database size={22} />} label="Items" value={`${formatCompact(item?.used)} / ${formatCompact(item?.total)}`} detail={`${percent(item?.usedPercent)} used`} percentValue={Number(item?.usedPercent)} tone="mint" />
      <MetricCard icon={<Droplets size={22} />} label="Fluids" value={`${formatCompact(fluid?.used)} / ${formatCompact(fluid?.total)}`} detail={`${percent(fluid?.usedPercent)} used`} percentValue={Number(fluid?.usedPercent)} tone="blue" />
      <MetricCard icon={<FlaskConical size={22} />} label="Chemicals" value={`${formatCompact(chemical?.used)} / ${formatCompact(chemical?.total)}`} detail={`${percent(chemical?.usedPercent)} used`} percentValue={Number(chemical?.usedPercent)} tone="violet" />
      <MetricCard icon={<Zap size={22} />} label="Energy" value={formatCompact(snapshot?.energy?.stored)} detail={`${formatCompact(snapshot?.energy?.capacity)} capacity`} tone="amber" />
      <MetricCard icon={<Activity size={22} />} label="TPS" value={Number(snapshot?.tps ?? 0).toFixed(2)} detail={`Fetched ${snapshot?.fetchedAt ?? "n/a"}`} tone="cyan" />
      <MetricCard icon={<ShieldAlert size={22} />} label="Alerts" value={String(alerts.length)} detail={alerts.length ? "needs attention" : "system clear"} tone={alerts.length ? "red" : "mint"} />

      <section className="hero-chart">
        <div className="toolbar compact">
          <div>
            <h3>Item Storage Trends</h3>
            <p>Total item usage over time</p>
          </div>
          <button onClick={() => setView("items")}>Open</button>
        </div>
        <TrendPanel title="Item usage" metric="usedPercent" category="Item" tone="mint" />
      </section>

      <section className="card resource-list">
        <div className="toolbar compact">
          <h3>Top Resources</h3>
          <button onClick={() => setView("items")}>Items</button>
        </div>
        {(growing.length ? growing : []).slice(0, 8).map((resource: any, index: number) => (
          <div className="resource-row" key={`${resource.name ?? index}`}>
            <span>{resource.displayName ?? resource.label ?? resource.name ?? `Resource ${index + 1}`}</span>
            <strong>{formatCompact(resource.amount ?? resource.value)}</strong>
            <em>{formatCompact(resource.rate ?? resource.change ?? 0)}/s</em>
          </div>
        ))}
        {!growing.length && <p className="muted">No resource trend data yet.</p>}
      </section>

      <TrendPanel title="Fluid Storage Trends" metric="usedPercent" category="Fluid" tone="blue" />
      <TrendPanel title="Chemical Storage Trends" metric="usedPercent" category="Chemical" tone="violet" />

      <section className="card autocraft-summary">
        <div className="toolbar compact">
          <div>
            <h3>Autocraft Status</h3>
            <p>{enabledRules} active rules · {autocraft?.lastStatus ?? "waiting for snapshot"}</p>
          </div>
          <button onClick={() => setView("autocraft")}>Configure</button>
        </div>
        {(rows ?? []).slice(0, 5).map((row: any) => (
          <div className="mini-rule" key={row.index}>
            <span className={cls("state-dot", row.state)} />
            <strong>{row.label}</strong>
            <span>{row.message}</span>
            <em>x{formatCompact(row.outputCount)}</em>
          </div>
        ))}
        {!rows.length && <p className="muted">No autocraft rows in the last snapshot.</p>}
      </section>

      <section className="card alerts-list">
        <div className="toolbar compact">
          <h3>Recent Alerts</h3>
          <Bell size={17} />
        </div>
        {alerts.length === 0 ? <p className="muted">No active alerts.</p> : alerts.slice(0, 6).map((alert: any, i: number) => (
          <p className={cls("alert", String(alert.severity).toLowerCase())} key={i}>{alert.severity}: {alert.text}</p>
        ))}
      </section>
    </div>
  );
}

function ResourceView({ category, tone }: { category: string; tone: "mint" | "blue" | "violet" }) {
  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h2>{category} usage</h2>
          <p>Storage pressure and trend history from saved snapshots.</p>
        </div>
      </div>
      <TrendPanel title={`${category} storage`} metric="usedPercent" category={category} tone={tone} />
    </section>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number | undefined) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={typeof value === "number" || typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: unknown; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label>
      {label}
      <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Autocraft({ snapshot, config, reload }: { snapshot: any; config: any; reload: () => void }) {
  const initial = config?.value?.autocraft ?? { enabled: true, rules: [] };
  const [draft, setDraft] = useState<any>(() => clone(initial));
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState("");

  useEffect(() => {
    setDraft(clone(initial));
    setSelected(0);
  }, [config?.version]);

  const rules: AutocraftRule[] = Array.isArray(draft?.rules) ? draft.rules : [];
  const rowByIndex = new Map((snapshot?.autocraft?.rows ?? []).map((row: any) => [row.index, row]));
  const selectedRule = rules[selected] ?? defaultRule;

  function setAutocraft(next: any) {
    setDraft({ ...draft, ...next });
  }

  function setRule(index: number, patch: Partial<AutocraftRule>) {
    const nextRules = rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule));
    setDraft({ ...draft, rules: nextRules });
  }

  async function persist(nextDraft = draft, message = "Saved") {
    try {
      setSaving("Saving...");
      await saveConfig({ ...(config?.value ?? {}), autocraft: nextDraft });
      await reload();
      setSaving(message);
      window.setTimeout(() => setSaving(""), 1800);
    } catch (error) {
      setSaving(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function toggleAutocraft() {
    const next = { ...draft, enabled: draft.enabled !== true };
    setDraft(next);
    await persist(next, next.enabled ? "Autocraft enabled" : "Autocraft disabled");
  }

  async function toggleRule(index: number) {
    const nextRules = rules.map((rule, i) => (i === index ? { ...rule, enabled: rule.enabled === false } : rule));
    const next = { ...draft, rules: nextRules };
    setDraft(next);
    await persist(next, "Rule updated");
  }

  function addRule() {
    const nextRules = [...rules, { ...defaultRule, label: `Rule ${rules.length + 1}` }];
    setDraft({ ...draft, rules: nextRules });
    setSelected(nextRules.length - 1);
  }

  function duplicateRule(index: number) {
    const source = rules[index] ?? defaultRule;
    const nextRules = [...rules.slice(0, index + 1), { ...clone(source), label: `${source.label ?? "Rule"} copy` }, ...rules.slice(index + 1)];
    setDraft({ ...draft, rules: nextRules });
    setSelected(index + 1);
  }

  async function deleteRule(index: number) {
    const nextRules = rules.filter((_, i) => i !== index);
    const next = { ...draft, rules: nextRules };
    setDraft(next);
    setSelected(Math.max(0, Math.min(index, nextRules.length - 1)));
    await persist(next, "Rule deleted");
  }

  return (
    <section className="panel autocraft-panel">
      <div className="toolbar">
        <div>
          <h2>Autocraft Control</h2>
          <p>Rules are saved into server runtime config and synced to the Lua script cache.</p>
        </div>
        <div className="actions">
          {saving && <span className="save-state"><CheckCircle2 size={16} />{saving}</span>}
          <button onClick={() => sendCommand("run_now")}><Play size={16} />Run now</button>
          <button className={draft.enabled ? "danger" : "primary"} onClick={toggleAutocraft}>
            <Power size={16} />{draft.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      </div>

      <div className="autocraft-layout">
        <section className="rules-list">
          <div className="rules-list-head">
            <strong>{rules.length} rules</strong>
            <button className="icon-button" title="Add rule" onClick={addRule}><Plus size={17} /></button>
          </div>
          {rules.map((rule, index) => {
            const row: any = rowByIndex.get(index + 1);
            return (
              <button className={cls("rule-row", selected === index && "selected")} key={index} onClick={() => setSelected(index)}>
                <span className={cls("state-dot", row?.state, rule.enabled === false && "disabled")} />
                <span>
                  <strong>{rule.label || rule.target || `Rule ${index + 1}`}</strong>
                  <small>{rule.source || "no source"}{" -> "}{rule.target || "no target"}</small>
                </span>
                <em>{row?.message ?? (rule.enabled === false ? "disabled" : "configured")}</em>
              </button>
            );
          })}
          {rules.length === 0 && <p className="muted">No rules configured.</p>}
        </section>

        <section className="rule-editor">
          <div className="editor-head">
            <div>
              <h3>{selectedRule.label || selectedRule.target || "New rule"}</h3>
              <p>Rule #{selected + 1}</p>
            </div>
            <div className="actions">
              <button onClick={() => toggleRule(selected)}>{selectedRule.enabled === false ? "Enable" : "Disable"}</button>
              <button className="icon-button" title="Duplicate rule" onClick={() => duplicateRule(selected)}><Copy size={16} /></button>
              <button className="icon-button danger" title="Delete rule" onClick={() => deleteRule(selected)}><Trash2 size={16} /></button>
            </div>
          </div>

          <div className="form-grid">
            <TextField label="Label" value={selectedRule.label} onChange={(value) => setRule(selected, { label: value })} />
            <TextField label="Source item id" value={selectedRule.source} onChange={(value) => setRule(selected, { source: value })} placeholder="mysticalagriculture:iron_essence" />
            <TextField label="Target item id" value={selectedRule.target} onChange={(value) => setRule(selected, { target: value })} placeholder="minecraft:iron_ingot" />
            <NumberField label="Source per craft" value={selectedRule.sourcePerCraft} onChange={(value) => setRule(selected, { sourcePerCraft: value })} />
            <NumberField label="Output per craft" value={selectedRule.outputPerCraft} onChange={(value) => setRule(selected, { outputPerCraft: value })} />
            <NumberField label="Fixed reserve" value={selectedRule.fixedReserve} onChange={(value) => setRule(selected, { fixedReserve: value })} />
            <NumberField label="Minimum job output" value={selectedRule.minOutputsPerJob} onChange={(value) => setRule(selected, { minOutputsPerJob: value })} />
            <NumberField label="Maximum job output" value={selectedRule.maxOutputsPerJob} onChange={(value) => setRule(selected, { maxOutputsPerJob: value })} />
            <NumberField label="Round to" value={selectedRule.roundTo} onChange={(value) => setRule(selected, { roundTo: value })} />
            <NumberField label="Target limit" value={selectedRule.targetLimit} onChange={(value) => setRule(selected, { targetLimit: value })} />
            <TextField label="Target NBT" value={selectedRule.targetNbt} onChange={(value) => setRule(selected, { targetNbt: value || undefined })} />
            <TextField label="Target fingerprint" value={selectedRule.targetFingerprint} onChange={(value) => setRule(selected, { targetFingerprint: value || undefined })} />
          </div>

          <div className="advanced-row">
            <NumberField label="Interval seconds" value={draft.intervalSeconds} onChange={(value) => setAutocraft({ intervalSeconds: value })} />
            <NumberField label="Max jobs per cycle" value={draft.maxJobsPerCycle} onChange={(value) => setAutocraft({ maxJobsPerCycle: value })} />
            <NumberField label="Global reserve min" value={draft.reserveMin} onChange={(value) => setAutocraft({ reserveMin: value })} />
            <NumberField label="Global reserve max" value={draft.reserveMax} onChange={(value) => setAutocraft({ reserveMax: value })} />
          </div>

          <div className="editor-footer">
            <button onClick={() => setDraft(clone(initial))}><X size={16} />Reset</button>
            <button className="primary" onClick={() => persist()}><Save size={16} />Save autocraft config</button>
          </div>
        </section>
      </div>
    </section>
  );
}

function SettingsView({ config, reload }: { config: any; reload: () => void }) {
  const [draft, setDraft] = useState<any>(config?.value ?? {});
  useEffect(() => setDraft(config?.value ?? {}), [config]);

  function setNumber(key: string, value: string) {
    setDraft((current: any) => ({ ...current, [key]: Number(value) }));
  }

  async function save() {
    await saveConfig(draft);
    reload();
  }

  return (
    <section className="panel settings-grid">
      <h2><SlidersHorizontal size={18} />Runtime settings</h2>
      <label>Refresh seconds<input type="number" value={draft.refreshSeconds ?? 1} onChange={(e) => setNumber("refreshSeconds", e.target.value)} /></label>
      <label>Warning threshold<input type="number" step="0.01" value={draft.alarmWarningStorage ?? 0.8} onChange={(e) => setNumber("alarmWarningStorage", e.target.value)} /></label>
      <label>Critical threshold<input type="number" step="0.01" value={draft.alarmCriticalStorage ?? 0.95} onChange={(e) => setNumber("alarmCriticalStorage", e.target.value)} /></label>
      <label>Alarm cooldown<input type="number" value={draft.alarmCooldownSeconds ?? 30} onChange={(e) => setNumber("alarmCooldownSeconds", e.target.value)} /></label>
      <button className="primary" onClick={save}><Save size={16} />Save config</button>
    </section>
  );
}

function App() {
  const [ready, setReady] = useState(Boolean(localStorage.getItem("atm10_token")));
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState("loading");

  const reload = () => getLatest().then(setData).then(() => setStatus("ready")).catch(() => setStatus("login"));

  useEffect(() => {
    if (!ready) return;
    reload();
    const interval = window.setInterval(reload, 10000);
    const ws = new WebSocket(eventsUrl());
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "snapshot" || message.type === "config" || message.type === "config_ack") reload();
    };
    ws.onopen = () => setStatus("live");
    ws.onclose = () => setStatus("offline");
    return () => {
      window.clearInterval(interval);
      ws.close();
    };
  }, [ready]);

  if (!ready || status === "login") return <Login onDone={() => setReady(true)} />;

  const snapshot = data?.snapshot?.payload;
  const online = data?.devices?.some((device: any) => device.online);

  return (
    <main className="app-shell">
      <aside>
        <div className="brand">
          <div className="brand-mark"><Database size={24} /></div>
          <div>
            <h1>ATM10 RS</h1>
            <p>Storage Dashboard</p>
          </div>
        </div>
        <nav>
          {views.map((item) => (
            <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
        <div className="side-status">
          <span className={online ? "state-dot ready" : "state-dot error"} />
          <strong>{online ? "Device online" : "Device offline"}</strong>
          <small>Web socket: {status}</small>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Refined Storage Network</p>
            <h2>{views.find((item) => item.id === view)?.label}</h2>
          </div>
          <span className={online ? "status online" : "status offline"}>
            {online ? "Live" : "Offline"} · {snapshot?.fetchedAt ?? "no snapshot"}
          </span>
        </header>
        {view === "overview" && <Overview snapshot={snapshot} config={data?.config} setView={setView} />}
        {view === "items" && <ResourceView category="Item" tone="mint" />}
        {view === "fluids" && <ResourceView category="Fluid" tone="blue" />}
        {view === "chemicals" && <ResourceView category="Chemical" tone="violet" />}
        {view === "autocraft" && <Autocraft snapshot={snapshot} config={data?.config} reload={reload} />}
        {view === "settings" && <SettingsView config={data?.config} reload={reload} />}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
