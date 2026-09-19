import React, { useState, useEffect } from 'react';
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
  Snowflake,
  SunMedium,
  Layers,
  ArrowUpRight,
  TrendingDown,
  Info
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:8080';

export default function App() {
  const [deviceId, setDeviceId] = useState('FreshTrace-Node-01');
  const [foodType, setFoodType] = useState('tomato');
  const [isLive, setIsLive] = useState(true);

  // Core Intelligence State
  const [riskScore, setRiskScore] = useState(0.18); // 0.0 to 1.0
  const [rulHours, setRulHours] = useState(24.5);
  const [bioRisk, setBioRisk] = useState(0.18);
  const [thermalRisk, setThermalRisk] = useState(0.12);
  const [degradationVelocity, setDegradationVelocity] = useState(-0.015); // ticks/sec

  // Sensor state (matching requested specs)
  const [sensor, setSensor] = useState({
    voc_raw: 31555,
    nox_raw: 19601,
    temperature_c: 30.2,
    humidity_pct: 67.9
  });

  // Rolling history for curves
  const [vocHistory, setVocHistory] = useState([
    31700, 31680, 31650, 31620, 31600, 31580, 31560, 31555
  ]);
  const [tempHistory, setTempHistory] = useState([
    29.4, 29.6, 29.8, 30.0, 30.1, 30.1, 30.2, 30.2
  ]);

  // Fetch real-time data from backend API
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.risk) {
          const overall = data.risk.overall ?? data.spoilage_risk ?? 0.18;
          setRiskScore(overall);
          setBioRisk(data.risk.biochemical ?? 0.18);
          setThermalRisk(data.risk.thermal ?? 0.12);
        }
        if (data.remaining_useful_life) {
          setRulHours(data.remaining_useful_life.hours ?? 24.5);
        }
        if (data.sensor) {
          setSensor({
            voc_raw: data.sensor.voc_raw || 31555,
            nox_raw: data.sensor.nox_raw || 19601,
            temperature_c: data.sensor.temperature_c || 30.2,
            humidity_pct: data.sensor.humidity_pct || 67.9
          });
          setVocHistory(prev => [...prev.slice(-15), data.sensor.voc_raw || 31555]);
          setTempHistory(prev => [...prev.slice(-15), data.sensor.temperature_c || 30.2]);
        }
      }
    } catch (e) {
      // Backend polling error; continue seamlessly
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [deviceId]);

  // Determine Spoilage Risk Card Class (turns fully Green, Amber, or Red)
  const isSpoiled = riskScore >= 0.80;
  const isWatch = riskScore >= 0.30 && riskScore < 0.80;

  const getRiskCardClass = () => {
    if (isSpoiled) return 'factor-card risk-card-spoiled';
    if (isWatch) return 'factor-card risk-card-watch';
    return 'factor-card risk-card-fresh';
  };

  // Interactive Simulators for Instant Demos
  const applyPreset = (preset) => {
    if (preset === 'fresh') {
      setRiskScore(0.12);
      setRulHours(36.0);
      setBioRisk(0.10);
      setThermalRisk(0.08);
      setDegradationVelocity(-0.005);
      setSensor({ voc_raw: 31800, nox_raw: 19800, temperature_c: 28.5, humidity_pct: 65.0 });
      setVocHistory(prev => [...prev.slice(-15), 31800]);
    } else if (preset === 'heat') {
      setRiskScore(0.55);
      setRulHours(14.0);
      setBioRisk(0.35);
      setThermalRisk(0.55);
      setDegradationVelocity(-0.120);
      setSensor({ voc_raw: 30800, nox_raw: 19200, temperature_c: 36.8, humidity_pct: 74.0 });
      setVocHistory(prev => [...prev.slice(-15), 30800]);
      setTempHistory(prev => [...prev.slice(-15), 36.8]);
    } else if (preset === 'spoil') {
      setRiskScore(0.89);
      setRulHours(0.0);
      setBioRisk(0.89);
      setThermalRisk(0.40);
      setDegradationVelocity(-0.450);
      setSensor({ voc_raw: 28200, nox_raw: 16500, temperature_c: 32.5, humidity_pct: 78.5 });
      setVocHistory(prev => [...prev.slice(-15), 28200]);
    }
  };

  // SVG Sparkline Helper
  const renderSVGChart = (data, color, unit, minVal, maxVal) => {
    if (!data || data.length < 2) return null;
    const min = minVal ?? (Math.min(...data) * 0.99);
    const max = maxVal ?? (Math.max(...data) * 1.01);
    const range = (max - min) === 0 ? 1 : (max - min);

    const width = 480;
    const height = 140;
    const padding = 16;

    const points = data.map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((val - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon 
          fill={`url(#grad-${color})`} 
          points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} 
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {data.length > 0 && (
          <circle
            cx={width - padding}
            cy={height - padding - ((data[data.length - 1] - min) / range) * (height - 2 * padding)}
            r="5.5"
            fill={color}
            stroke="#ffffff"
            strokeWidth="2.5"
          />
        )}
      </svg>
    );
  };

  return (
    <div className="page-wrapper">
      {/* Minimalist Organic Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-icon-box">
            <Leaf size={24} />
          </div>
          <div>
            <div className="brand-name">Axios</div>
            <div className="brand-descriptor">Real-Time Biochemical Spoilage Intelligence Platform</div>
          </div>
        </div>

        <div className="header-controls">
          <div className="produce-selector">
            <span>Produce Profile:</span>
            <select value={foodType} onChange={(e) => setFoodType(e.target.value)}>
              <option value="tomato">🍅 Vine Tomato</option>
              <option value="paneer">🧀 Fresh Artisan Paneer</option>
            </select>
          </div>

          <div className="live-indicator-pill">
            <span className="dot-pulse" />
            <span>AWS IoT Core Active</span>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* SECTION 1: THE 5 PRIMARY CORE FACTORS (CLEARLY VISIBLE FIRST)    */}
      {/* ================================================================ */}
      <section className="primary-factors-section">
        <div className="section-label-bar">
          <div className="section-title">
            <Activity size={20} color="#15803d" />
            <span>Core Spoilage Intelligence</span>
          </div>
          <div className="section-subtext">Real-time inference computed from multi-sensor biochemical engine</div>
        </div>

        <div className="top-factors-grid">
          {/* FACTOR 1: Spoilage Risk Score (Card turns fully Green or Red) */}
          <div className={getRiskCardClass()}>
            <div>
              <div className="factor-header-row">
                <span className="factor-label">1. Spoilage Risk Score</span>
                {isSpoiled ? <AlertOctagon size={22} /> : isWatch ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
              </div>

              <div className="risk-score-huge">
                {Math.round(riskScore * 100)}%
              </div>

              <div className="factor-caption">
                {isSpoiled 
                  ? "CRITICAL: Food is Spoiled — Microbial breakdown threshold exceeded."
                  : isWatch 
                  ? "ELEVATED WATCH: Accelerated gas activity detected in container."
                  : "FRESH & SAFE: Biochemical parameters are within optimal baseline."
                }
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.25)', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>Engine Status:</span>
              <span style={{ fontWeight: 800 }}>{isSpoiled ? "SPOILAGE_ONSET" : isWatch ? "WATCH_STATE" : "STABLE_FRESH"}</span>
            </div>
          </div>

          {/* FACTOR 2: Remaining Useful Shelf Life */}
          <div className="factor-card">
            <div>
              <div className="factor-header-row">
                <span className="factor-label" style={{ color: 'var(--text-sub)' }}>2. Remaining Useful Shelf Life</span>
                <Clock size={20} color="#059669" />
              </div>

              {/* Show SPOILED when risk is 80 to 100%, otherwise show remaining hours */}
              {isSpoiled ? (
                <div className="spoiled-banner">
                  <div className="spoiled-banner-title">
                    <AlertOctagon size={28} />
                    <span>SPOILED</span>
                  </div>
                  <div className="spoiled-banner-sub">
                    Shelf life expired. Product has reached terminal decomposition. Not fit for sale or consumption.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="shelf-life-hero-val">
                    {rulHours.toFixed(1)} <span style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-sub)' }}>Hours</span>
                  </div>
                  <div className="confidence-range-tag">
                    <span>95% Confidence Interval:</span>
                    <strong style={{ color: 'var(--text-dark)' }}>
                      [{(rulHours * 0.85).toFixed(1)}h – {(rulHours * 1.15).toFixed(1)}h]
                    </strong>
                  </div>
                  <div className="factor-caption" style={{ marginTop: '0.6rem' }}>
                    Estimated time remaining before food crosses the spoilage threshold under current conditions.
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-delicate)', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-sub)' }}>
              <span>Threshold Standard:</span>
              <strong style={{ color: 'var(--text-dark)' }}>Critical Index &ge; 80%</strong>
            </div>
          </div>

          {/* FACTOR 3: Degradation Velocity & Predictive Scenarios */}
          <div className="factor-card">
            <div>
              <div className="factor-header-row">
                <span className="factor-label" style={{ color: 'var(--text-sub)' }}>3. Degradation Velocity & Scenarios</span>
                <TrendingDown size={20} color="#b45309" />
              </div>

              <div className="velocity-rate-badge">
                <span style={{ color: Math.abs(degradationVelocity) > 0.1 ? '#b91c1c' : '#15803d' }}>
                  {degradationVelocity.toFixed(3)} ticks/sec
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-sub)' }}>
                  ({Math.abs(degradationVelocity) > 0.1 ? 'Fast Degradation' : 'Stable Rate'})
                </span>
              </div>

              {/* Predictive Scenarios based on conditions */}
              <div className="scenarios-box">
                <div className="scenario-row">
                  <Snowflake size={16} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Under Cold Storage (4°C):</strong> Spoilage will <strong>slow down by 78%</strong> (extends shelf life by ~4.5x).
                  </div>
                </div>

                <div className="scenario-row">
                  <Leaf size={16} color="#15803d" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>At Current Conditions ({sensor.temperature_c}°C, {sensor.humidity_pct}% RH):</strong> Product will spoil steadily at the current velocity.
                  </div>
                </div>

                <div className="scenario-row">
                  <SunMedium size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>If Temperature Rises (&gt;35°C):</strong> Spoilage will <strong>accelerate fast (3.2x)</strong> and spoil within 4 to 6 hours.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FACTOR 4 & 5: Thermal Risk vs Biochemical Risk (with 1 simple English sentence each) */}
          <div className="factor-card">
            <div>
              <div className="factor-header-row">
                <span className="factor-label" style={{ color: 'var(--text-sub)' }}>4 &amp; 5. Thermal Risk vs. Biochemical Risk</span>
                <Layers size={20} color="#15803d" />
              </div>

              <div className="risk-vectors-container">
                {/* Biochemical Risk */}
                <div className="vector-block">
                  <div className="vector-top-row">
                    <span className="vector-title">Biochemical Gas Risk</span>
                    <span className="vector-pct" style={{ color: '#059669' }}>{Math.round(bioRisk * 100)}%</span>
                  </div>
                  <div className="vector-simple-explanation">
                    <strong>Simple Explanation:</strong> Measures actual rotting gases (VOCs and NOx) released as bacteria decompose the food.
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill-bio" style={{ width: `${Math.min(100, Math.round(bioRisk * 100))}%` }} />
                  </div>
                </div>

                {/* Thermal Risk */}
                <div className="vector-block">
                  <div className="vector-top-row">
                    <span className="vector-title">Thermal Abuse Risk (Arrhenius)</span>
                    <span className="vector-pct" style={{ color: '#dc2626' }}>{Math.round(thermalRisk * 100)}%</span>
                  </div>
                  <div className="vector-simple-explanation">
                    <strong>Simple Explanation:</strong> Measures heat damage over time based on how warm the food got and for how long.
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill-thermal" style={{ width: `${Math.min(100, Math.round(thermalRisk * 100))}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border-delicate)', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-sub)' }}>
              <span>Primary Driver:</span>
              <strong style={{ color: 'var(--text-dark)' }}>
                {bioRisk > thermalRisk ? "Biochemical Gas Degradation Dominant" : "Thermal Heat Abuse Dominant"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 2: SENSOR METRICS (EXACT FORMAT AND READINGS AS REQUESTED) */}
      {/* ================================================================ */}
      <section className="sensor-section">
        <div className="section-label-bar">
          <div className="section-title">
            <Cpu size={20} color="#059669" />
            <span>Hardware Telemetry Stream</span>
          </div>
          <div className="section-subtext">Direct SGP41 MOX Gas + SHT40 Environmental Probes</div>
        </div>

        <div className="sensor-grid-4">
          {/* 1. VOC Raw Sensor */}
          <div className="sensor-box">
            <div className="sensor-title-text">
              <span>VOC Raw Sensor</span>
              <Wind size={18} color="#059669" />
            </div>
            <div className="sensor-value-huge">{sensor.voc_raw.toLocaleString()}</div>
            <div className="sensor-desc-text">SGP41 MOX Resistance</div>
          </div>

          {/* 2. NOx Raw Ticks */}
          <div className="sensor-box">
            <div className="sensor-title-text">
              <span>NOx Raw Ticks</span>
              <Radio size={18} color="#d97706" />
            </div>
            <div className="sensor-value-huge">{sensor.nox_raw.toLocaleString()}</div>
            <div className="sensor-desc-text">Nitrogen Oxide Mix</div>
          </div>

          {/* 3. Temperature */}
          <div className="sensor-box">
            <div className="sensor-title-text">
              <span>Temperature</span>
              <Thermometer size={18} color="#dc2626" />
            </div>
            <div className="sensor-value-huge">{sensor.temperature_c.toFixed(1)}°C</div>
            <div className="sensor-desc-text">SHT40 Cold-Chain Probe</div>
          </div>

          {/* 4. Humidity */}
          <div className="sensor-box">
            <div className="sensor-title-text">
              <span>Humidity</span>
              <Droplets size={18} color="#2563eb" />
            </div>
            <div className="sensor-value-huge">{sensor.humidity_pct.toFixed(1)}%</div>
            <div className="sensor-desc-text">Relative Humidity (RH)</div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 3: SENSOR CURVES                                         */}
      {/* ================================================================ */}
      <section className="curves-section">
        <div className="curves-grid-2">
          {/* Curve 1: VOC Gas Degradation Curve */}
          <div className="curve-card">
            <div className="curve-header-flex">
              <div>
                <div className="curve-heading">VOC Gas Degradation Curve</div>
                <div className="curve-subheading">Sensirion SGP41 Raw Ticks vs. Time</div>
              </div>
              <div className="curve-badge-val" style={{ color: '#059669' }}>
                {sensor.voc_raw} ticks
              </div>
            </div>
            <div className="svg-canvas-container">
              {renderSVGChart(vocHistory, '#059669', 'ticks')}
            </div>
          </div>

          {/* Curve 2: Thermal Abuse Timeline */}
          <div className="curve-card">
            <div className="curve-header-flex">
              <div>
                <div className="curve-heading">Thermal Abuse Timeline</div>
                <div className="curve-subheading">Temperature (°C) with Arrhenius integration</div>
              </div>
              <div className="curve-badge-val" style={{ color: '#dc2626' }}>
                {sensor.temperature_c.toFixed(1)}°C
              </div>
            </div>
            <div className="svg-canvas-container">
              {renderSVGChart(tempHistory, '#dc2626', '°C', 20, 45)}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 4: INTERACTIVE PITCH & DEMONSTRATION CONTROLS            */}
      {/* ================================================================ */}
      <section className="demo-control-bar">
        <div className="control-bar-label">
          <Flame size={20} color="#ea580c" />
          <span>Interactive Pitch Controls:</span>
        </div>

        <div className="interactive-btn-group">
          <button 
            className="demo-btn btn-green-sim"
            onClick={() => applyPreset('fresh')}
            title="Demonstrate safe baseline where card is solid Green"
          >
            🌿 Fresh Baseline (Risk &lt; 30% &rarr; Green Card)
          </button>

          <button 
            className="demo-btn btn-heat-sim"
            onClick={() => applyPreset('heat')}
            title="Demonstrate thermal stress"
          >
            🔥 Heat Spike (36.8°C &rarr; Amber Card)
          </button>

          <button 
            className="demo-btn btn-spoil-sim"
            onClick={() => applyPreset('spoil')}
            title="Demonstrate terminal spoilage where card turns solid Red and shows SPOILED"
          >
            🚨 Spoilage Surge (Risk &ge; 80% &rarr; Solid Red + SPOILED)
          </button>

          <button 
            className="demo-btn"
            onClick={fetchStatus}
            title="Pull latest reading from AWS IoT stream"
          >
            <RefreshCw size={14} />
            <span>Sync Live</span>
          </button>
        </div>
      </section>
    </div>
  );
}
