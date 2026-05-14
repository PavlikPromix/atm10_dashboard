import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  Gauge,
  Play,
  Power,
  Save,
  Server,
  Settings,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { eventsUrl, getHistory, getLatest, login, saveConfig, sendCommand } from "./lib/api";
import "./styles.css";

type View = "overview" | "items" | "fluids" | "chemicals" | "autocraft" | "settings";

const views: Array<{ id: View; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Gauge size={16} /> },
  { id: "items", label: "Items", icon: <Boxes size={16} /> },
  { id: "fluids", label: "Fluids", icon: <Activity size={16} /> },
  { id: "chemicals", label: "Chemicals", icon: <Zap size={16} /> },
  { id: "autocraft", label: "Autocraft", icon: <Play size={16} /> },
  { id: "settings", label: "Settings", icon: <Settings size={16} /> },
];

function formatNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

function percent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "n/a";
  return `${Math.round(n * 1000) / 10}%`;
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
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
        <Server size={28} />
        <h1>ATM10 RS Dashboard</h1>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}

function Chart({ points }: { points: Array<{ createdAt: string; value: number }> }) {
  const path = useMemo(() => {
    if (points.length < 2) return "";
    const values = points.map((p) => Number(p.value)).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * 100;
        const y = 100 - ((Number(point.value) - min) / span) * 100;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={path} />
    </svg>
  );
}

function StorageCard({ storage }: { storage: any }) {
  const pct = Number(storage?.usedPercent);
  return (
    <section className="card storage-card">
      <div className="card-title">
        <span>{storage?.title ?? storage?.key}</span>
        <strong>{percent(storage?.usedPercent)}</strong>
      </div>
      <div className="bar">
        <span style={{ width: `${Number.isFinite(pct) ? Math.min(pct * 100, 100) : 0}%` }} />
      </div>
      <dl>
        <div><dt>Used</dt><dd>{formatNumber(storage?.used)}</dd></div>
        <div><dt>Free</dt><dd>{formatNumber(storage?.free)}</dd></div>
        <div><dt>Total</dt><dd>{formatNumber(storage?.total)}</dd></div>
        <div><dt>Rate</dt><dd>{formatNumber(storage?.rate)}/s</dd></div>
      </dl>
      <p>{storage?.forecast?.text ?? "Forecast: n/a"}</p>
    </section>
  );
}

function Overview({ snapshot }: { snapshot: any }) {
  return (
    <div className="grid">
      {(snapshot?.storages ?? []).map((storage: any) => <StorageCard key={storage.key} storage={storage} />)}
      <section className="card">
        <div className="card-title"><span>Energy</span><Zap size={16} /></div>
        <p className="big">{formatNumber(snapshot?.energy?.stored)}</p>
        <p>Capacity {formatNumber(snapshot?.energy?.capacity)}</p>
      </section>
      <section className="card">
        <div className="card-title"><span>System</span><Activity size={16} /></div>
        <p className="big">TPS {Number(snapshot?.tps ?? 0).toFixed(1)}</p>
        <p>Fetched {snapshot?.fetchedAt ?? "n/a"}</p>
      </section>
      <section className="card wide">
        <div className="card-title"><span>Alerts</span><Bell size={16} /></div>
        {(snapshot?.alerts ?? []).length === 0 ? <p>No active alerts</p> : snapshot.alerts.map((alert: any, i: number) => (
          <p className={`alert ${String(alert.severity).toLowerCase()}`} key={i}>{alert.severity}: {alert.text}</p>
        ))}
      </section>
    </div>
  );
}

function ResourceView({ category }: { category: string }) {
  const [range, setRange] = useState("24h");
  const [points, setPoints] = useState<Array<{ createdAt: string; value: number }>>([]);

  useEffect(() => {
    getHistory("usedPercent", category, range).then((data) => setPoints(data.points)).catch(() => setPoints([]));
  }, [category, range]);

  return (
    <section className="panel">
      <div className="toolbar">
        <h2>{category} usage</h2>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="1h">1h</option>
          <option value="24h">24h</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
      </div>
      <Chart points={points} />
    </section>
  );
}

function Autocraft({ snapshot }: { snapshot: any }) {
  const rows = snapshot?.autocraft?.rows ?? [];
  return (
    <section className="panel">
      <div className="toolbar">
        <h2>Autocraft</h2>
        <button onClick={() => sendCommand("run_now")}><Play size={16} />Run now</button>
        <button onClick={() => sendCommand("set_autocraft_enabled", { enabled: !snapshot?.autocraft?.enabled })}>
          <Power size={16} />{snapshot?.autocraft?.enabled ? "Disable" : "Enable"}
        </button>
      </div>
      <div className="table">
        <div className="table-head">Rule</div>
        <div className="table-head">Source</div>
        <div className="table-head">Target</div>
        <div className="table-head">State</div>
        <div className="table-head">Action</div>
        {rows.map((row: any) => (
          <React.Fragment key={row.index}>
            <div>{row.label}</div>
            <div>{formatNumber(row.sourceAmount)}</div>
            <div>{row.target} x{formatNumber(row.outputCount)}</div>
            <div>{row.message}</div>
            <button onClick={() => sendCommand("set_rule_enabled", { index: row.index, enabled: !row.enabled })}>
              {row.enabled ? "Disable" : "Enable"}
            </button>
          </React.Fragment>
        ))}
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
      <button onClick={save}><Save size={16} />Save config</button>
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
      if (message.type === "snapshot") reload();
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
        <h1>ATM10 RS</h1>
        <nav>
          {views.map((item) => (
            <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)}>
              {item.icon}{item.label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Refined Storage</p>
            <h2>{views.find((item) => item.id === view)?.label}</h2>
          </div>
          <span className={online ? "status online" : "status offline"}>
            {online ? "Device online" : "Device offline"} · {status}
          </span>
        </header>
        {view === "overview" && <Overview snapshot={snapshot} />}
        {view === "items" && <ResourceView category="Item" />}
        {view === "fluids" && <ResourceView category="Fluid" />}
        {view === "chemicals" && <ResourceView category="Chemical" />}
        {view === "autocraft" && <Autocraft snapshot={snapshot} />}
        {view === "settings" && <SettingsView config={data?.config} reload={reload} />}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
