import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  AlertOctagon, 
  Thermometer, 
  Droplets, 
  Wind, 
  Clock, 
  Radio, 
  Flame, 
  Leaf, 
  Cpu, 
  Activity, 
  RefreshCw, 
  FileText, 
  Layers
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:8080';

export default function App() {
  const [deviceId, setDeviceId] = useState('FreshTrace-Node-01');
  const [foodType, setFoodType] = useState('paneer');
  const [isConnected, setIsConnected] = useState(true);
  const [lastSync, setLastSync] = useState(new Date());

  // Real-time status state
  const [status, setStatus] = useState({
    state: 'STABLE',
    overall_risk: 0.0,
    dominant_risk: 'LOW_RISK',
    risk: { biochemical: 0.0, thermal: 0.0, overall: 0.0, dominant: 'LOW_RISK' },
    remaining_useful_life: { hours: 72.0, lower: 61.2, upper: 72.0 },
    sensor: { temperature_c: 29.69, humidity_pct: 68.04, voc_raw: 249, nox_raw: 0 }
  });

  // History for charts
  const [history, setHistory] = useState([
    { time: '16:00', voc: 249, nox: 0, temp: 29.5, humidity: 67.8 },
    { time: '16:01', voc: 249, nox: 0, temp: 29.6, humidity: 68.0 },
    { time: '16:02', voc: 250, nox: 0, temp: 29.7, humidity: 68.1 },
    { time: '16:03', voc: 248, nox: 0, temp: 29.7, humidity: 68.0 },
    { time: '16:04', voc: 249, nox: 0, temp: 29.69, humidity: 68.04 }
  ]);

  // Evidence Ledger events
  const [events, setEvents] = useState([
    {
      id: 1,
      event: 'BASELINE_ESTABLISHED',
      timestamp: new Date().toISOString(),
      severity: 0.0,
      evidence: { voc_baseline: 249.0, method: 'rolling_median_ema' }
    }
  ]);

  // Fetch live state from backend API
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setIsConnected(true);
        setLastSync(new Date());

        // Append to local chart history
        setHistory(prev => {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const newPoint = {
            time: nowStr,
            voc: data.sensor.voc_raw,
            nox: data.sensor.nox_raw,
            temp: data.sensor.temperature_c,
            humidity: data.sensor.humidity_pct
          };
          const next = [...prev.slice(-19), newPoint];
          return next;
        });
      }
    } catch (e) {
      // Backend polling error; maintain UI
      setIsConnected(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/events`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setEvents(data);
        }
      }
    } catch (e) {}
  };

  // Poll API every 2.5s for live updates
  useEffect(() => {
    fetchStatus();
    fetchEvents();
    const interval = setInterval(() => {
      fetchStatus();
      fetchEvents();
    }, 2500);
    return () => clearInterval(interval);
  }, [deviceId]);

  // Interactive demo simulations
  const injectSample = async (customPayload) => {
    try {
      const payload = {
        device_id: deviceId,
        food_type: foodType,
        temperature_c: customPayload.temp ?? status.sensor.temperature_c,
        humidity_pct: customPayload.humidity ?? status.sensor.humidity_pct,
        voc_raw: customPayload.voc ?? status.sensor.voc_raw,
        nox_raw: customPayload.nox ?? status.sensor.nox_raw,
        wifi_rssi: -34
      };
      const res = await fetch(`${API_BASE}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchStatus();
        fetchEvents();
      }
    } catch (e) {
      console.error("Simulation error:", e);
    }
  };

  // State presentation helpers
  const getStateBadge = (st) => {
    switch (st) {
      case 'STABLE':
        return { label: 'STABLE · FRESH', icon: <ShieldCheck size={16} />, class: 'status-STABLE' };
      case 'WATCH':
        return { label: 'WATCH · ELEVATED', icon: <AlertTriangle size={16} />, class: 'status-WATCH' };
      case 'ONSET_CANDIDATE':
        return { label: 'ONSET CANDIDATE', icon: <Activity size={16} />, class: 'status-ONSET_CANDIDATE' };
      case 'SPOILAGE_ONSET':
        return { label: 'SPOILAGE ONSET CONFIRMED', icon: <AlertOctagon size={16} />, class: 'status-SPOILAGE_ONSET' };
      default:
        return { label: st, icon: <ShieldCheck size={16} />, class: 'status-STABLE' };
    }
  };

  const badgeInfo = getStateBadge(status.state);
  const overallPct = Math.round((status.risk?.overall ?? status.spoilage_risk ?? 0) * 100);

  // SVG Gauge calculations
  const radius = 70;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (overallPct / 100) * circumference;

  const getGaugeColor = (pct) => {
    if (pct < 25) return '#10b981';
    if (pct < 65) return '#f59e0b';
    return '#ef4444';
  };

  // Helper for rendering SVG sparklines
  const renderSparkline = (data, dataKey, color, unit) => {
    if (!data || data.length < 2) return null;
    const values = data.map(d => d[dataKey]);
    const min = Math.min(...values);
    const max = Math.max(...values) || 1;
    const range = (max - min) === 0 ? 1 : (max - min);

    const width = 450;
    const height = 130;
    const padding = 15;

    const points = values.map((val, idx) => {
      const x = padding + (idx / (values.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {/* Soft fill under curve */}
        <polygon 
          fill={`url(#grad-${dataKey})`} 
          points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} 
        />
        {/* Polyline line */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {/* Current point dot */}
        {values.length > 0 && (
          <circle
            cx={width - padding}
            cy={height - padding - ((values[values.length - 1] - min) / range) * (height - 2 * padding)}
            r="5"
            fill={color}
            stroke="#ffffff"
            strokeWidth="2"
          />
        )}
      </svg>
    );
  };

  return (
    <div className="app-container">
      {/* Navigation & Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Leaf size={24} />
          </div>
          <div>
            <div className="brand-title">
              Axios
              <span className="brand-tag">Bio-Intelligence</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Real-time biochemical spoilage & cold-chain evidence platform
            </div>
          </div>
        </div>

        <div className="header-meta">
          <div className="cloud-pill">
            <span className="pulse-dot" />
            <span>AWS IoT Core</span>
            <span style={{ color: '#047857', fontWeight: 400 }}>ap-south-1</span>
          </div>

          <div className="food-badge">
            <Layers size={14} />
            <span>Profile:</span>
            <select 
              value={foodType} 
              onChange={(e) => setFoodType(e.target.value)}
              style={{ background: 'transparent', border: 'none', fontWeight: 700, color: '#92400e', cursor: 'pointer' }}
            >
              <option value="paneer">🧀 Fresh Paneer</option>
              <option value="tomato">🍅 Vine Tomato</option>
            </select>
          </div>

          <div className="card" style={{ padding: '0.35rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cpu size={14} color="var(--text-muted)" />
            <span style={{ fontWeight: 600 }}>{deviceId}</span>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="dashboard-grid">
        {/* Left Column: Hero Risk & RUL */}
        <section className="left-column">
          {/* Primary Spoilage Onset & Risk Card */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Activity size={18} color="var(--green-primary)" />
                Spoilage State Engine
              </span>
              <span className="card-subtitle">Arrhenius + SGP41</span>
            </div>

            {/* Status Badge */}
            <div style={{ textAlign: 'center', margin: '0.5rem 0 1.25rem 0' }}>
              <div className={`status-pill-hero ${badgeInfo.class}`}>
                {badgeInfo.icon}
                <span>{badgeInfo.label}</span>
              </div>
            </div>

            {/* Radial Risk Progress Gauge */}
            <div className="risk-display-container">
              <div className="radial-meter">
                <svg height={radius * 2} width={radius * 2} style={{ transform: 'rotate(-90deg)' }}>
                  <circle
                    stroke="var(--bg-card-subtle)"
                    fill="transparent"
                    strokeWidth={stroke}
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                  />
                  <circle
                    stroke={getGaugeColor(overallPct)}
                    fill="transparent"
                    strokeWidth={stroke}
                    strokeDasharray={circumference + ' ' + circumference}
                    style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
                    strokeLinecap="round"
                    r={normalizedRadius}
                    cx={radius}
                    cy={radius}
                  />
                </svg>
                <div className="radial-inner-text">
                  <div className="risk-pct-value">{overallPct}%</div>
                  <div className="risk-pct-label">Overall Risk</div>
                </div>
              </div>
            </div>

            {/* Remaining Useful Life (RUL) Hero Box */}
            <div className="rul-clock-box">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>
                <Clock size={15} />
                <span>REMAINING USEFUL LIFE (RUL)</span>
              </div>
              <div className="rul-hours-large">
                {status.remaining_useful_life?.hours?.toFixed(1) ?? '72.0'} <span style={{ fontSize: '1rem', fontWeight: 600 }}>Hours</span>
              </div>
              <div className="rul-bounds-text">
                Confidence: [{status.remaining_useful_life?.lower?.toFixed(1)}h – {status.remaining_useful_life?.upper?.toFixed(1)}h]
              </div>
            </div>

            {/* Multi-Vector Breakdown */}
            <div className="vector-breakdown-box">
              <div>
                <div className="vector-bar-header">
                  <span>Biochemical Degradation Risk</span>
                  <span>{Math.round((status.risk?.biochemical ?? 0) * 100)}%</span>
                </div>
                <div className="progress-track">
                  <div 
                    className="progress-fill-bio" 
                    style={{ width: `${Math.min(100, Math.round((status.risk?.biochemical ?? 0) * 100))}%` }} 
                  />
                </div>
              </div>

              <div>
                <div className="vector-bar-header">
                  <span>Thermal Exposure Risk (Arrhenius)</span>
                  <span>{Math.round((status.risk?.thermal ?? 0) * 100)}%</span>
                </div>
                <div className="progress-track">
                  <div 
                    className="progress-fill-thermal" 
                    style={{ width: `${Math.min(100, Math.round((status.risk?.thermal ?? 0) * 100))}%` }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                <span>Dominant Vector:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{status.dominant_risk ?? 'LOW_RISK'}</span>
              </div>
            </div>
          </div>

          {/* Audit & Compliance Evidence Ledger */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <FileText size={18} color="var(--green-primary)" />
                Audit Evidence Ledger
              </span>
              <span className="card-subtitle">AWS S3 Signed</span>
            </div>

            <div className="evidence-list">
              {events.map((ev, i) => (
                <div key={ev.id || i} className="evidence-item">
                  <div>
                    <div className="evidence-name">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: ev.severity > 0.5 ? '#dc2626' : '#10b981' }} />
                      {ev.event}
                    </div>
                    <div className="evidence-time">
                      {new Date(ev.timestamp).toLocaleTimeString()} · Severity {ev.severity}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: '#ffffff', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontWeight: 600, color: 'var(--text-muted)' }}>
                    Verified
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: Sensors & Live Graphs */}
        <section className="right-column">
          {/* Top Sensor Metric Cards */}
          <div className="sensor-metrics-grid">
            {/* VOC Raw Ticks */}
            <div className="metric-card">
              <div className="metric-top">
                <span>VOC Raw Sensor</span>
                <Wind size={16} color="#059669" />
              </div>
              <div className="metric-value">{status.sensor?.voc_raw ?? 249}</div>
              <div className="metric-sub">SGP41 MOX Resistance</div>
            </div>

            {/* NOx Gas Level */}
            <div className="metric-card">
              <div className="metric-top">
                <span>NOx Raw Ticks</span>
                <Radio size={16} color="#d97706" />
              </div>
              <div className="metric-value">{status.sensor?.nox_raw ?? 0}</div>
              <div className="metric-sub">Nitrogen Oxide Mix</div>
            </div>

            {/* Temperature */}
            <div className="metric-card">
              <div className="metric-top">
                <span>Temperature</span>
                <Thermometer size={16} color="#dc2626" />
              </div>
              <div className="metric-value">{status.sensor?.temperature_c?.toFixed(1) ?? '29.7'}°C</div>
              <div className="metric-sub">SHT40 Cold-Chain Probe</div>
            </div>

            {/* Humidity */}
            <div className="metric-card">
              <div className="metric-top">
                <span>Humidity</span>
                <Droplets size={16} color="#2563eb" />
              </div>
              <div className="metric-value">{status.sensor?.humidity_pct?.toFixed(1) ?? '68.0'}%</div>
              <div className="metric-sub">Relative Humidity (RH)</div>
            </div>
          </div>

          {/* Time Series Charts Container */}
          <div className="charts-container">
            {/* Chart 1: Gas Telemetry */}
            <div className="chart-box">
              <div className="chart-header">
                <div>
                  <div className="chart-title">VOC Gas Degradation Curve</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sensirion SGP41 Raw Ticks vs. Time</div>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#059669' }}>
                  {status.sensor?.voc_raw} ticks
                </div>
              </div>
              <div className="chart-canvas-wrapper">
                {renderSparkline(history, 'voc', '#059669', 'ticks')}
              </div>
            </div>

            {/* Chart 2: Temperature Curve */}
            <div className="chart-box">
              <div className="chart-header">
                <div>
                  <div className="chart-title">Thermal Abuse Timeline</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Temperature (°C) with Arrhenius integration</div>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>
                  {status.sensor?.temperature_c?.toFixed(1)}°C
                </div>
              </div>
              <div className="chart-canvas-wrapper">
                {renderSparkline(history, 'temp', '#dc2626', '°C')}
              </div>
            </div>
          </div>

          {/* Real-time Demo Simulation & Pitch Controls */}
          <div className="sim-controls-bar">
            <div className="sim-label">
              <Flame size={18} color="#ea580c" />
              <span>Live Pitch & Demonstration Controls:</span>
            </div>

            <div className="sim-buttons-group">
              <button 
                className="btn-sim btn-sim-fresh"
                onClick={() => injectSample({ voc: 249, temp: 29.5, humidity: 68.0 })}
              >
                🌿 Inject Normal Fresh Reading
              </button>

              <button 
                className="btn-sim btn-sim-heat"
                onClick={() => injectSample({ voc: 245, temp: 37.5, humidity: 72.0 })}
              >
                🔥 Inject Thermal Spike (37.5°C)
              </button>

              <button 
                className="btn-sim btn-sim-spoil"
                onClick={() => injectSample({ voc: 180, temp: 31.0, humidity: 75.0 })}
              >
                🚨 Inject VOC Gas Surge (Spoilage)
              </button>

              <button 
                className="btn-sim"
                onClick={fetchStatus}
                title="Refresh Status"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
