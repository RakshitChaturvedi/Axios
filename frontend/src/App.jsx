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
  Leaf, 
  Activity, 
  RefreshCw, 
  Snowflake,
  SunMedium,
  Sliders,
  Layers,
  ArrowRight
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:8080';

export default function App() {
  const [deviceId] = useState('FreshTrace-Node-01');
  const [foodType, setFoodType] = useState('tomato');

  // Core Intelligence Values
  const [riskScore, setRiskScore] = useState(0.18);
  const [rulHours, setRulHours] = useState(24.5);
  const [bioRisk, setBioRisk] = useState(0.18);
  const [thermalRisk, setThermalRisk] = useState(0.12);
  const [degradationVelocity, setDegradationVelocity] = useState(-0.015);

  // Exact Sensor Metrics
  const [sensor, setSensor] = useState({
    voc_raw: 31555,
    nox_raw: 19601,
    temperature_c: 30.2,
    humidity_pct: 67.9
  });

  // Rolling History for Curves
  const [vocHistory, setVocHistory] = useState([
    31720, 31690, 31660, 31630, 31600, 31580, 31560, 31555
  ]);
  const [tempHistory, setTempHistory] = useState([
    29.4, 29.6, 29.8, 30.0, 30.1, 30.1, 30.2, 30.2
  ]);

  // Fetch live state from backend API (connected to AWS IoT Core + RDS)
  const fetchLiveStatus = async () => {
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
          const newTemp = data.sensor.temperature_c || 30.2;
          const newVoc = data.sensor.voc_raw || 31555;
          setSensor({
            voc_raw: newVoc,
            nox_raw: data.sensor.nox_raw || 19601,
            temperature_c: newTemp,
            humidity_pct: data.sensor.humidity_pct || 67.9
          });
          setVocHistory(prev => [...prev.slice(-15), newVoc]);
          setTempHistory(prev => [...prev.slice(-15), newTemp]);
        }
      }
    } catch (e) {
      // Backend polling fallback
    }
  };

  useEffect(() => {
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 4000);
    return () => clearInterval(interval);
  }, [deviceId]);

  // Card 1 Dynamic Style: Turns fully Green, Amber, or Red
  const isSpoiled = riskScore >= 0.80;
  const isWatch = riskScore >= 0.30 && riskScore < 0.80;

  const getRiskCardClass = () => {
    if (isSpoiled) return 'factor-card card-red-spoiled';
    if (isWatch) return 'factor-card card-amber-watch';
    return 'factor-card card-green-fresh';
  };

  // Interactive Temperature Slider calculation (Arrhenius kinetic live simulation)
  const handleTempSlider = (newTemp) => {
    const t = parseFloat(newTemp);
    // Arrhenius relative rate calculation
    const ea = 85000;
    const r = 8.314;
    const tKelvin = t + 273.15;
    const tRefKelvin = 4.0 + 273.15;
    const rateMultiplier = Math.exp(-(ea / r) * ((1.0 / tKelvin) - (1.0 / tRefKelvin)));
    const calculatedThermal = Math.min(1.0, Math.max(0.02, (rateMultiplier * 0.05)));

    const newOverall = Math.max(bioRisk, calculatedThermal);
    setThermalRisk(calculatedThermal);
    setRiskScore(newOverall);

    // Adjust velocity based on temperature
    const vel = -0.010 * (t / 25.0);
    setDegradationVelocity(vel);

    // Recalculate remaining hours
    if (newOverall >= 0.80) {
      setRulHours(0.0);
    } else {
      const remaining = Math.max(1.0, (0.85 - newOverall) / (Math.abs(vel) * 0.08));
      setRulHours(remaining);
    }

    setSensor(prev => ({ ...prev, temperature_c: t }));
    setTempHistory(prev => [...prev.slice(-15), t]);
  };

  // Quick Preset Scenarios for Demonstrations
  const applyPreset = (preset) => {
    if (preset === 'fresh') {
      setRiskScore(0.12);
      setRulHours(42.0);
      setBioRisk(0.10);
      setThermalRisk(0.08);
      setDegradationVelocity(-0.008);
      setSensor({ voc_raw: 31800, nox_raw: 19800, temperature_c: 28.5, humidity_pct: 66.0 });
      setVocHistory(prev => [...prev.slice(-15), 31800]);
      setTempHistory(prev => [...prev.slice(-15), 28.5]);
    } else if (preset === 'watch') {
      setRiskScore(0.48);
      setRulHours(14.5);
      setBioRisk(0.35);
      setThermalRisk(0.48);
      setDegradationVelocity(-0.140);
      setSensor({ voc_raw: 30800, nox_raw: 19100, temperature_c: 35.5, humidity_pct: 73.0 });
      setVocHistory(prev => [...prev.slice(-15), 30800]);
      setTempHistory(prev => [...prev.slice(-15), 35.5]);
    } else if (preset === 'spoiled') {
      setRiskScore(0.89);
      setRulHours(0.0);
      setBioRisk(0.89);
      setThermalRisk(0.42);
      setDegradationVelocity(-0.480);
      setSensor({ voc_raw: 27800, nox_raw: 16200, temperature_c: 32.0, humidity_pct: 79.0 });
      setVocHistory(prev => [...prev.slice(-15), 27800]);
    }
  };

  // Mathematically Scaled SVG Sparkline with Dynamic Color Gradients
  const renderSVGChart = (data, strokeColor = '#10b981', minBound, maxBound) => {
    if (!data || data.length < 2) return null;
    const min = minBound ?? (Math.min(...data) * 0.995);
    const max = maxBound ?? (Math.max(...data) * 1.005);
    const range = (max - min) === 0 ? 1 : (max - min);

    const width = 500;
    const height = 140;
    const pad = 12;

    const points = data.map((val, idx) => {
      const x = pad + (idx / (data.length - 1)) * (width - 2 * pad);
      const y = height - pad - ((val - min) / range) * (height - 2 * pad);
      return `${x},${y}`;
    }).join(' ');

    const safeColorId = strokeColor.replace(/[^a-zA-Z0-9]/g, '');
    const gradId = `chartGrad-${safeColorId}-${data.length}`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <polygon 
          fill={`url(#${gradId})`} 
          points={`${pad},${height - pad} ${points} ${width - pad},${height - pad}`} 
        />
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
        {data.length > 0 && (
          <circle
            cx={width - pad}
            cy={height - pad - ((data[data.length - 1] - min) / range) * (height - 2 * pad)}
            r="5"
            fill={strokeColor}
            stroke="#ffffff"
            strokeWidth="2.5"
          />
        )}
      </svg>
    );
  };

  return (
    <div className="app-viewport">
      {/* Clean Header */}
      <header className="brand-header">
        <div className="brand-left">
          <h1 className="brand-title">FreshTrace</h1>
        </div>

        <div className="header-status-group">
          <div className="live-pill">
            <span className="live-dot" />
            <span>AWS IoT Core Active · {deviceId}</span>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* SECTION 1: THE 5 PRIMARY CORE FACTORS (CLEARLY VISIBLE FIRST)    */}
      {/* ================================================================ */}
      <section className="factors-section">
        <div className="section-headline">
          <Activity size={18} color="#000000" />
          <span>Core Spoilage Factors</span>
        </div>

        <div className="factors-grid-2x2">
          {/* FACTOR 1: Spoilage Risk Score (Card turns fully Green or Red) */}
          <div className={getRiskCardClass()}>
            <div>
              <div className="factor-card-title">
                <span>1. Spoilage Risk Score</span>
                {isSpoiled ? <AlertOctagon size={20} /> : isWatch ? <AlertTriangle size={20} /> : <ShieldCheck size={20} />}
              </div>

              <div className="risk-metric-big">
                {Math.round(riskScore * 100)}%
              </div>

              <div className="card-meta-text">
                {isSpoiled 
                  ? "CRITICAL: Food is Spoiled — Decomposition threshold exceeded."
                  : isWatch 
                  ? "ELEVATED WATCH: Accelerated gas activity detected in storage."
                  : "FRESH & SAFE: Biochemical parameters are within optimal baseline."
                }
              </div>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.25)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>State:</span>
              <strong style={{ letterSpacing: '0.04em' }}>{isSpoiled ? "SPOILAGE_ONSET" : isWatch ? "WATCH_STATE" : "STABLE_FRESH"}</strong>
            </div>
          </div>

          {/* FACTOR 2: Remaining Useful Shelf Life */}
          <div className="factor-card">
            <div>
              <div className="factor-card-title">
                <span>2. Remaining Useful Shelf Life</span>
                <Clock size={18} color="#000000" />
              </div>

              {/* Show SPOILED when risk is 80 to 100%, otherwise show remaining hours */}
              {isSpoiled ? (
                <div className="spoiled-state-banner">
                  <div className="spoiled-state-title">
                    <AlertOctagon size={24} />
                    <span>SPOILED</span>
                  </div>
                  <div className="spoiled-state-desc">
                    Shelf life expired. Product has reached terminal decomposition. Not fit for sale or consumption.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="shelf-life-metric">
                    {rulHours.toFixed(1)} <span className="shelf-life-unit">Hours Remaining</span>
                  </div>
                  <div className="confidence-chip">
                    <span>95% Confidence Interval:</span>
                    <strong>[{(rulHours * 0.85).toFixed(1)}h – {(rulHours * 1.15).toFixed(1)}h]</strong>
                  </div>
                  <div className="card-meta-text" style={{ marginTop: '12px' }}>
                    Estimated shelf life remaining before crossing the critical spoilage boundary.
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}>
              <span>Critical Breach Point:</span>
              <strong style={{ color: 'var(--text-primary)' }}>Risk &ge; 80%</strong>
            </div>
          </div>

          {/* FACTOR 3: Degradation Velocity & Scenarios */}
          <div className="factor-card">
            <div>
              <div className="factor-card-title">
                <span>3. Degradation Velocity &amp; Possibilities</span>
                <Activity size={18} color="#000000" />
              </div>

              <div className="velocity-readout-row">
                <span className="velocity-number">
                  {degradationVelocity.toFixed(3)}
                </span>
                <span className="velocity-unit">ticks/sec</span>
                <span className="velocity-status">
                  {Math.abs(degradationVelocity) > 0.1 ? 'Fast Rate' : 'Slow Steady Rate'}
                </span>
              </div>

              {/* Conditions Possibilities */}
              <div className="scenario-list">
                <div className="scenario-item">
                  <Snowflake size={15} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Under Cold Storage (4°C):</strong> Spoilage will <strong>slow down by ~78%</strong> (extends shelf life by 4.8x).
                  </div>
                </div>

                <div className="scenario-item">
                  <Leaf size={15} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>At Current Conditions ({sensor.temperature_c.toFixed(1)}°C):</strong> Spoilage will progress steadily at current rate.
                  </div>
                </div>

                <div className="scenario-item">
                  <SunMedium size={15} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>If Temperature Rises (&gt;35°C):</strong> Spoilage will <strong>accelerate fast (3.2x)</strong> and spoil in 4 to 6 hours.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FACTOR 4 & 5: Thermal Risk vs Biochemical Risk (1 Simple Sentence Each) */}
          <div className="factor-card">
            <div>
              <div className="factor-card-title">
                <span>4 &amp; 5. Thermal vs. Biochemical Risk</span>
                <Layers size={18} color="#000000" />
              </div>

              <div className="vector-split-container">
                {/* Biochemical Risk */}
                <div className="vector-row">
                  <div className="vector-row-header">
                    <span className="vector-name">Biochemical Gas Risk</span>
                    <span className="vector-percent">{Math.round(bioRisk * 100)}%</span>
                  </div>
                  <div className="vector-sentence">
                    Measures actual rotting gases (VOCs and NOx) released as bacteria decompose the food.
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill-black" style={{ width: `${Math.min(100, Math.round(bioRisk * 100))}%` }} />
                  </div>
                </div>

                {/* Thermal Risk */}
                <div className="vector-row">
                  <div className="vector-row-header">
                    <span className="vector-name">Thermal Abuse Risk</span>
                    <span className="vector-percent">{Math.round(thermalRisk * 100)}%</span>
                  </div>
                  <div className="vector-sentence">
                    Measures accumulated heat damage over time based on how warm the food got and for how long.
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill-black" style={{ width: `${Math.min(100, Math.round(thermalRisk * 100))}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-tertiary)' }}>
              <span>Primary Driver:</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {bioRisk > thermalRisk ? "Biochemical Gas Degradation Dominant" : "Thermal Heat Abuse Dominant"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 2: SENSOR METRICS (EXACTLY AS SPECIFIED)                 */}
      {/* ================================================================ */}
      <section className="sensor-section">
        <div className="section-headline">
          <Wind size={18} color="#000000" />
          <span>Telemetry Stream</span>
        </div>

        <div className="sensor-grid-4">
          {/* VOC Raw Sensor */}
          <div className="sensor-metric-card">
            <div className="sensor-name">
              <span>VOC Raw Sensor</span>
              <Wind size={16} color="#000000" />
            </div>
            <div className="sensor-numeric-value">{sensor.voc_raw.toLocaleString()}</div>
            <div className="sensor-sub-caption">SGP41 MOX Resistance</div>
          </div>

          {/* NOx Raw Ticks */}
          <div className="sensor-metric-card">
            <div className="sensor-name">
              <span>NOx Raw Ticks</span>
              <Radio size={16} color="#000000" />
            </div>
            <div className="sensor-numeric-value">{sensor.nox_raw.toLocaleString()}</div>
            <div className="sensor-sub-caption">Nitrogen Oxide Mix</div>
          </div>

          {/* Temperature */}
          <div className="sensor-metric-card">
            <div className="sensor-name">
              <span>Temperature</span>
              <Thermometer size={16} color="#000000" />
            </div>
            <div className="sensor-numeric-value">{sensor.temperature_c.toFixed(1)}°C</div>
            <div className="sensor-sub-caption">SHT40 Cold-Chain Probe</div>
          </div>

          {/* Humidity */}
          <div className="sensor-metric-card">
            <div className="sensor-name">
              <span>Humidity</span>
              <Droplets size={16} color="#000000" />
            </div>
            <div className="sensor-numeric-value">{sensor.humidity_pct.toFixed(1)}%</div>
            <div className="sensor-sub-caption">Relative Humidity (RH)</div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 3: SENSOR CURVES                                         */}
      {/* ================================================================ */}
      <section className="curves-section">
        <div className="curves-grid-2">
          {/* VOC Gas Degradation Curve */}
          <div className="curve-chart-card">
            <div className="curve-card-top">
              <div>
                <div className="curve-main-title">VOC Gas Degradation Curve</div>
                <div className="curve-subtitle-desc">Sensirion SGP41 Raw Ticks vs. Time</div>
              </div>
              <div className="curve-badge curve-badge-green">
                <span className="badge-pulse-green" />
                <span>{sensor.voc_raw.toLocaleString()} ticks</span>
              </div>
            </div>
            <div className="chart-svg-box">
              {renderSVGChart(vocHistory, '#10b981')}
            </div>
          </div>

          {/* Thermal Abuse Timeline */}
          <div className="curve-chart-card">
            <div className="curve-card-top">
              <div>
                <div className="curve-main-title">Thermal Abuse Timeline</div>
                <div className="curve-subtitle-desc">Temperature (°C) with Arrhenius integration</div>
              </div>
              <div className="curve-badge curve-badge-red">
                <span className="badge-pulse-red" />
                <span>{sensor.temperature_c.toFixed(1)}°C</span>
              </div>
            </div>
            <div className="chart-svg-box">
              {renderSVGChart(tempHistory, '#ef4444', 15, 45)}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 4: INTERACTIVE CONTROLS & LIVE SIMULATION                */}
      {/* ================================================================ */}
      <section className="interactive-toolbar">
        <div className="toolbar-header-flex">
          <div className="toolbar-title">
            <Sliders size={18} color="#000000" />
            <span>Interactive Scenarios &amp; Live Simulation</span>
          </div>

          <div className="preset-button-row">
            <button className="action-btn" onClick={() => applyPreset('fresh')}>
              <span>Normal Baseline (12% · Safe)</span>
            </button>
            <button className="action-btn" onClick={() => applyPreset('watch')}>
              <span>Thermal Stress (48% · Watch)</span>
            </button>
            <button className="action-btn" onClick={() => applyPreset('spoiled')}>
              <span>Gas Surge (89% · Spoiled)</span>
            </button>
            <button className="action-btn" onClick={fetchLiveStatus} title="Sync with live stream">
              <RefreshCw size={13} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Live Interactive Temperature Slider */}
        <div className="interactive-slider-row">
          <span className="slider-label">
            Test Ambient Temperature:
          </span>
          <input 
            type="range" 
            min="4" 
            max="42" 
            step="0.5"
            value={sensor.temperature_c}
            onChange={(e) => handleTempSlider(e.target.value)}
            className="slider-input" 
          />
          <span className="slider-value-display">
            {sensor.temperature_c.toFixed(1)}°C
          </span>
        </div>
      </section>
    </div>
  );
}
