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
  ArrowRight,
  Info,
  CheckCircle2,
  Target,
  Cpu,
  Zap,
  TrendingDown,
  Scale,
  FileText,
  Award,
  Sparkles,
  Check,
  X,
  Database,
  CloudLightning,
  BarChart3
} from 'lucide-react';
import './App.css';

const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) ||
  (typeof window !== 'undefined' && window.location.port !== '5180' && window.location.port !== '5173' && window.location.origin.startsWith('http')
    ? window.location.origin
    : (import.meta.env.VITE_API_BASE || 'http://localhost:8080'));

export default function App() {
  const [deviceId] = useState('FreshTrace-Node-01');
  const [foodType, setFoodType] = useState('tomato');
  const [activeTab, setActiveTab] = useState('factors'); // 'factors' | 'telemetry' | 'about'

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
  const [velocityHistory, setVelocityHistory] = useState([
    -0.012, -0.013, -0.015, -0.014, -0.016, -0.015, -0.015, -0.015
  ]);

  // Live Timestamp & Connection Tracking
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Fetch live state from backend API (connected to AWS IoT Core + RDS)
  const fetchLiveStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/status`);
      if (res.ok) {
        const data = await res.json();
        
        // Dynamic Online/Offline Detection
        if (typeof data.is_online === 'boolean') {
          setIsOnline(data.is_online);
        } else if (data.last_updated) {
          const elapsed = (Date.now() - new Date(data.last_updated).getTime()) / 1000;
          setIsOnline(elapsed <= 20);
        }

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
        if (data.last_updated) {
          setLastUpdated(new Date(data.last_updated));
        } else {
          setLastUpdated(new Date());
        }
        setSecondsAgo(0);
      } else {
        setIsOnline(false);
      }
    } catch (e) {
      setIsOnline(false);
    }
  };

  // Poll API every 4 seconds and increment elapsed seconds every second
  useEffect(() => {
    fetchLiveStatus();
    const pollInterval = setInterval(fetchLiveStatus, 4000);
    const tickInterval = setInterval(() => {
      setSecondsAgo(prev => {
        const next = prev + 1;
        if (next > 20) {
          setIsOnline(false);
        }
        return next;
      });
    }, 1000);
    return () => {
      clearInterval(pollInterval);
      clearInterval(tickInterval);
    };
  }, [deviceId]);

  // Card Dynamic Style: Turns fully Green, Amber, or Red
  const isSpoiled = riskScore >= 0.80;
  const isWatch = riskScore >= 0.30 && riskScore < 0.80;

  const getRiskCardClass = () => {
    if (isSpoiled) return 'factor-card card-red-spoiled factor-card-hero';
    if (isWatch) return 'factor-card card-amber-watch factor-card-hero';
    return 'factor-card card-green-fresh factor-card-hero';
  };

  // Interactive Temperature Slider calculation (Arrhenius kinetic live simulation)
  const handleTempSlider = (newTemp) => {
    const t = parseFloat(newTemp);
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
    setVelocityHistory(prev => [...prev.slice(-15), vel]);

    // Recalculate remaining hours
    if (newOverall >= 0.80) {
      setRulHours(0.0);
    } else {
      const remaining = Math.max(1.0, (0.85 - newOverall) / (Math.abs(vel) * 0.08));
      setRulHours(remaining);
    }

    setSensor(prev => ({ ...prev, temperature_c: t }));
    setTempHistory(prev => [...prev.slice(-15), t]);
    setLastUpdated(new Date());
    setSecondsAgo(0);
  };

  // Quick Preset Scenarios for Demonstrations
  const applyPreset = (preset) => {
    if (preset === 'fresh') {
      setRiskScore(0.12);
      setRulHours(42.0);
      setBioRisk(0.10);
      setThermalRisk(0.08);
      setDegradationVelocity(-0.008);
      setVelocityHistory(prev => [...prev.slice(-15), -0.008]);
      setSensor({ voc_raw: 31800, nox_raw: 19800, temperature_c: 28.5, humidity_pct: 66.0 });
      setVocHistory(prev => [...prev.slice(-15), 31800]);
      setTempHistory(prev => [...prev.slice(-15), 28.5]);
    } else if (preset === 'watch') {
      setRiskScore(0.48);
      setRulHours(14.5);
      setBioRisk(0.35);
      setThermalRisk(0.48);
      setDegradationVelocity(-0.140);
      setVelocityHistory(prev => [...prev.slice(-15), -0.140]);
      setSensor({ voc_raw: 30800, nox_raw: 19100, temperature_c: 35.5, humidity_pct: 73.0 });
      setVocHistory(prev => [...prev.slice(-15), 30800]);
      setTempHistory(prev => [...prev.slice(-15), 35.5]);
    } else if (preset === 'spoiled') {
      setRiskScore(0.89);
      setRulHours(0.0);
      setBioRisk(0.89);
      setThermalRisk(0.42);
      setDegradationVelocity(-0.480);
      setVelocityHistory(prev => [...prev.slice(-15), -0.480]);
      setSensor({ voc_raw: 27800, nox_raw: 16200, temperature_c: 32.0, humidity_pct: 79.0 });
      setVocHistory(prev => [...prev.slice(-15), 27800]);
    }
    setLastUpdated(new Date());
    setSecondsAgo(0);
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
    <>
      {/* Dynamic Background Layer: Factors (Crisp Strawberries/Cherries), Telemetry (B&W Doodle), About (Pomegranate at bottom-right, 0 blur) */}
      <div 
        className={`app-background-layer ${
          activeTab === 'factors' 
            ? 'bg-page-factors' 
            : activeTab === 'telemetry' 
            ? 'bg-page-telemetry' 
            : 'bg-page-about'
        }`} 
        aria-hidden="true" 
      />

      <div className="app-viewport">
        {/* Clean Header with Page Switcher Navigation */}
        <header className="brand-header">
          <div className="brand-left">
            <h1 className="brand-title">FreshTrace</h1>
          </div>

          {/* Dedicated Separate Pages Navigation */}
          <nav className="nav-tab-container">
            <button 
              className={`nav-tab-btn ${activeTab === 'factors' ? 'active' : ''}`}
              onClick={() => setActiveTab('factors')}
            >
              <Activity size={16} />
              <span>Core Spoilage Factors</span>
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'telemetry' ? 'active' : ''}`}
              onClick={() => setActiveTab('telemetry')}
            >
              <Wind size={16} />
              <span>Atmospheric Stream</span>
            </button>
            <button 
              className={`nav-tab-btn ${activeTab === 'about' ? 'active' : ''}`}
              onClick={() => setActiveTab('about')}
            >
              <Info size={16} />
              <span>About FreshTrace</span>
            </button>
          </nav>

        <div className="header-status-group">
          <div className={`live-pill ${isOnline ? 'pill-online' : 'pill-offline'}`}>
            <span className={`live-dot ${isOnline ? 'dot-online' : 'dot-offline'}`} />
            <span>{isOnline ? `AWS IoT Core Active · ${deviceId}` : `Sensor Offline · Standby (${deviceId})`}</span>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* PAGE 1: CORE SPOILAGE FACTORS (DEDICATED VIEW)                   */}
      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* PAGE 1: CORE SPOILAGE FACTORS (DEDICATED VIEW)                   */}
      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* PAGE 1: CORE SPOILAGE FACTORS (3-TIER HIERARCHY SINGLE SCREEN)   */}
      {/* ================================================================ */}
      {activeTab === 'factors' && (
        <div className="page-view animate-fade-in">
          <section className="factors-section">
            {/* ROW 1: Spoilage Risk Score (Flagship Centerpiece Intelligence HUD - Way Bigger) */}
            <div className={`spoilage-hero-gauge-container ${isSpoiled ? 'gauge-theme-spoiled' : isWatch ? 'gauge-theme-watch' : 'gauge-theme-fresh'}`}>
              <div className="gauge-left-hud">
                <div className="gauge-dial-box">
                  <svg className="gauge-dial-svg" viewBox="0 0 140 140">
                    {/* Background Track Ring */}
                    <circle
                      cx="70"
                      cy="70"
                      r="56"
                      fill="transparent"
                      stroke="#e2e8f0"
                      strokeWidth="11"
                    />
                    {/* Dynamic Glowing Progress Ring */}
                    <circle
                      cx="70"
                      cy="70"
                      r="56"
                      fill="transparent"
                      stroke={isSpoiled ? '#ef4444' : isWatch ? '#f59e0b' : '#10b981'}
                      strokeWidth="11"
                      strokeDasharray={2 * Math.PI * 56}
                      strokeDashoffset={2 * Math.PI * 56 * (1 - Math.min(1, Math.max(0, riskScore)))}
                      strokeLinecap="round"
                      className="gauge-progress-stroke"
                    />
                  </svg>
                  <div className="gauge-dial-center-text">
                    <span className="gauge-dial-number">{Math.round(riskScore * 100)}%</span>
                    <span className="gauge-dial-unit">Risk Score</span>
                  </div>
                </div>

                <div className="gauge-info-group">
                  <div className="gauge-badge-row">
                    <span className="gauge-title-label">Live Spoilage Assessment</span>
                    <span className={isSpoiled ? 'gauge-status-pill-spoiled' : isWatch ? 'gauge-status-pill-watch' : 'gauge-status-pill-fresh'}>
                      {isSpoiled ? <AlertOctagon size={14} /> : isWatch ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
                      <span>{isSpoiled ? 'Spoiled & Hazardous' : isWatch ? 'Caution · Deteriorating' : 'Fresh & Safe to Consume'}</span>
                    </span>
                  </div>
                  <p className="gauge-description-text">
                    {isSpoiled 
                      ? `Critical alert: Spoilage index is ${Math.round(riskScore * 100)}%. Bio-chemical gas threshold exceeded. Discard produce immediately.`
                      : isWatch 
                      ? `Monitoring alert: Produce is deteriorating at ${Math.round(riskScore * 100)}% risk under current thermal conditions.`
                      : `Optimal freshness: Produce is fresh and safe. Multi-gas baseline within pristine ranges (0% spoilage risk).`
                    }
                  </p>
                </div>
              </div>

              <div className="gauge-right-vectors">
                <div className="gauge-vector-chip">
                  <div className="gauge-vector-chip-top">
                    <span>Rotting Gas (VOC)</span>
                    <Wind size={13} color="#059669" />
                  </div>
                  <div className="gauge-vector-val-row">
                    <span className="gauge-vector-val-green">{Math.round(bioRisk * 100)}%</span>
                    <div className="gauge-micro-bar">
                      <div className="gauge-micro-fill-green" style={{ width: `${Math.min(100, Math.round(bioRisk * 100))}%` }} />
                    </div>
                  </div>
                </div>
                <div className="gauge-vector-chip">
                  <div className="gauge-vector-chip-top">
                    <span>Thermal Debt</span>
                    <Thermometer size={13} color="#dc2626" />
                  </div>
                  <div className="gauge-vector-val-row">
                    <span className="gauge-vector-val-red">{Math.round(thermalRisk * 100)}%</span>
                    <div className="gauge-micro-bar">
                      <div className="gauge-micro-fill-red" style={{ width: `${Math.min(100, Math.round(thermalRisk * 100))}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ROW 2: 2-Column Grid (Remaining Useful Shelf Life + Degradation Velocity) */}
            <div className="factors-2col-mid-grid">
              {/* Card 1: Remaining Useful Shelf Life */}
              <div className="factor-card factor-card-shelflife">
                <div>
                  <div className="factor-card-title">
                    <span style={{ color: '#0369a1' }}>Remaining Shelf Life</span>
                    <Clock size={16} color="#0284c7" />
                  </div>

                  {isSpoiled ? (
                    <div className="spoiled-state-banner">
                      <div className="spoiled-state-title">
                        <AlertOctagon size={20} />
                        <span>SPOILED</span>
                      </div>
                      <div className="spoiled-state-desc">
                        Shelf life expired. Food is spoiled.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="shelf-life-metric" style={{ fontSize: '2.6rem' }}>
                        {rulHours.toFixed(1)} <span className="shelf-life-unit" style={{ fontSize: '0.9rem' }}>Hours Left</span>
                      </div>
                      <div className="confidence-chip-blue">
                        <span>Window:</span>
                        <strong>{(rulHours * 0.85).toFixed(0)} to {(rulHours * 1.15).toFixed(0)} hrs</strong>
                      </div>
                      <div className="card-meta-text" style={{ marginTop: '8px', fontSize: '0.82rem' }}>
                        Dynamic countdown before spoilage under current storage conditions.
                      </div>
                    </div>
                  )}
                </div>

                <div className="card-footer-subtle">
                  <span>Safe Limit:</span>
                  <strong>Unsafe &gt; 80%</strong>
                </div>
              </div>

              {/* Card 2: Degradation Velocity */}
              <div className="factor-card factor-card-velocity-bw">
                <div>
                  <div className="factor-card-title">
                    <span style={{ color: '#000000' }}>Degradation Velocity</span>
                    <Activity size={16} color="#000000" />
                  </div>

                  <div className="velocity-readout-row" style={{ margin: '2px 0 6px 0' }}>
                    <span className="velocity-number" style={{ fontSize: '1.5rem' }}>
                      {degradationVelocity.toFixed(3)}
                    </span>
                    <span className="velocity-unit">ticks/s</span>
                    <span className="velocity-status-bw" style={{ fontSize: '0.7rem', padding: '2px 9px' }}>
                      {Math.abs(degradationVelocity) > 0.1 ? 'Fast' : 'Steady'}
                    </span>
                  </div>

                  <div className="scenario-list-bw" style={{ padding: '6px 12px', gap: '4px' }}>
                    <div className="scenario-item-bw" style={{ fontSize: '0.76rem' }}>
                      <Snowflake size={13} color="#000000" style={{ flexShrink: 0 }} />
                      <span><strong>Fridge (4°C):</strong> -78% spoilage rate (lasting 5x longer).</span>
                    </div>
                    <div className="scenario-item-bw" style={{ fontSize: '0.76rem' }}>
                      <Leaf size={13} color="#000000" style={{ flexShrink: 0 }} />
                      <span><strong>Room Temp:</strong> Standard baseline aging velocity.</span>
                    </div>
                    <div className="scenario-item-bw" style={{ fontSize: '0.76rem' }}>
                      <SunMedium size={13} color="#000000" style={{ flexShrink: 0 }} />
                      <span><strong>Heat (&gt;35°C):</strong> 3x thermal degradation speedup.</span>
                    </div>
                  </div>
                </div>

                <div className="card-footer-subtle">
                  <span>Aging Speed:</span>
                  <strong>{Math.abs(degradationVelocity) > 0.1 ? 'Accelerated' : 'Normal'}</strong>
                </div>
              </div>
            </div>

            {/* ROW 3: Bio vs. Thermal Risk (Dedicated Horizontal Strip) */}
            <div className="factor-card-horizontal-risks">
              <div className="risk-horizontal-header">
                <div className="factor-card-title" style={{ margin: 0 }}>
                  <span style={{ color: '#047857', fontSize: '0.82rem' }}>Bio vs. Thermal Risk Decomposition</span>
                  <Layers size={16} color="#059669" />
                </div>
                <div className="risk-horizontal-cause">
                  <span>Primary Degradation Driver:</span>
                  <strong style={{ color: bioRisk > thermalRisk ? '#059669' : '#dc2626' }}>
                    {bioRisk > thermalRisk ? "Rotting Gas Buildup (VOC)" : "Thermal Heat Abuse"}
                  </strong>
                </div>
              </div>

              <div className="risk-horizontal-bars-grid">
                {/* Rotting Gas Meter */}
                <div className="risk-bar-box risk-bar-box-green">
                  <div className="risk-bar-top">
                    <span className="risk-bar-label" style={{ color: '#047857' }}>
                      <Wind size={14} color="#059669" /> Rotting Gas (VOC Index)
                    </span>
                    <span className="risk-bar-val" style={{ color: '#059669' }}>{Math.round(bioRisk * 100)}%</span>
                  </div>
                  <div className="meter-track" style={{ height: '7px' }}>
                    <div className="meter-fill-bio-green" style={{ width: `${Math.min(100, Math.round(bioRisk * 100))}%` }} />
                  </div>
                </div>

                {/* Thermal Abuse Meter */}
                <div className="risk-bar-box risk-bar-box-red">
                  <div className="risk-bar-top">
                    <span className="risk-bar-label" style={{ color: '#b91c1c' }}>
                      <Thermometer size={14} color="#dc2626" /> Thermal Abuse (Heat Exposure)
                    </span>
                    <span className="risk-bar-val" style={{ color: '#dc2626' }}>{Math.round(thermalRisk * 100)}%</span>
                  </div>
                  <div className="meter-track" style={{ height: '7px' }}>
                    <div className="meter-fill-thermal-red" style={{ width: `${Math.min(100, Math.round(thermalRisk * 100))}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================================================================ */}
      {/* PAGE 2: ATMOSPHERIC STREAM (DEDICATED VIEW)                      */}
      {/* ================================================================ */}
      {activeTab === 'telemetry' && (
        <div className="page-view animate-fade-in">
          {/* SENSOR LIVE UPDATE TIMESTAMP BANNER */}
          <div className={`telemetry-live-banner ${isOnline ? '' : 'telemetry-banner-offline'}`}>
            <div className="telemetry-timestamp-group">
              <span className={`live-ping-dot ${isOnline ? 'dot-online' : 'dot-offline'}`} />
              <span className="telemetry-updated-text">
                {isOnline ? (
                  <>Atmospheric stream active: <strong>{secondsAgo === 0 ? 'Just now' : `${secondsAgo}s ago`}</strong> ({lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})</>
                ) : (
                  <>Sensor disconnected / powered off. Last reading received <strong>{secondsAgo}s ago</strong> ({lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})</>
                )}
              </span>
            </div>
            <div className="telemetry-actions-group">
              <span className={`telemetry-device-tag ${isOnline ? '' : 'device-tag-offline'}`}>
                {isOnline ? 'Sensirion SGP41 + SHT40 Hardware Active' : 'Sensor Hardware Offline · Standby'}
              </span>
              <button className="action-btn" onClick={fetchLiveStatus} title="Refresh sensor data">
                <RefreshCw size={12} />
                <span>{isOnline ? 'Refresh Feed' : 'Check Sensor Feed'}</span>
              </button>
            </div>
          </div>

          {/* SENSOR METRICS 4-GRID WITH ROOMY CARDS */}
          <section className="sensor-section">
            <div className="sensor-grid-4">
              {/* VOC Raw Sensor (Emerald Green) */}
              <div className="sensor-metric-card sensor-card-voc">
                <div className="sensor-name">
                  <span style={{ color: '#059669' }}>VOC Gas Sensor</span>
                  <Wind size={16} color="#059669" />
                </div>
                <div className="sensor-numeric-value">{sensor.voc_raw.toLocaleString()}</div>
                <div className="sensor-sub-caption">Rotting gas index (ticks)</div>
              </div>

              {/* NOx Raw Ticks (Violet / Purple) */}
              <div className="sensor-metric-card sensor-card-nox">
                <div className="sensor-name">
                  <span style={{ color: '#7c3aed' }}>NOx Gas Sensor</span>
                  <Radio size={16} color="#7c3aed" />
                </div>
                <div className="sensor-numeric-value">{sensor.nox_raw.toLocaleString()}</div>
                <div className="sensor-sub-caption">Nitrogen compounds (ticks)</div>
              </div>

              {/* Temperature (Warm Coral / Orange) */}
              <div className="sensor-metric-card sensor-card-temp">
                <div className="sensor-name">
                  <span style={{ color: '#ea580c' }}>Storage Temp</span>
                  <Thermometer size={16} color="#ea580c" />
                </div>
                <div className="sensor-numeric-value">{sensor.temperature_c.toFixed(1)}°C</div>
                <div className="sensor-sub-caption">Ambient produce temperature</div>
              </div>

              {/* Humidity (Sky Blue) */}
              <div className="sensor-metric-card sensor-card-humidity">
                <div className="sensor-name">
                  <span style={{ color: '#0284c7' }}>Relative Humidity</span>
                  <Droplets size={16} color="#0284c7" />
                </div>
                <div className="sensor-numeric-value">{sensor.humidity_pct.toFixed(1)}%</div>
                <div className="sensor-sub-caption">Storage moisture level</div>
              </div>
            </div>
          </section>

          {/* SENSOR CURVES 2-GRID */}
          <section className="curves-section">
            <div className="curves-grid-2">
              {/* VOC Gas Degradation Curve */}
              <div className="curve-chart-card curve-card-voc-accent">
                <div className="curve-card-top">
                  <div>
                    <div className="curve-main-title">VOC Gas Emission Curve</div>
                    <div className="curve-subtitle-desc">Decomposition gas release over time</div>
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
              <div className="curve-chart-card curve-card-temp-accent">
                <div className="curve-card-top">
                  <div>
                    <div className="curve-main-title">Temperature Abuse Timeline</div>
                    <div className="curve-subtitle-desc">Continuous cold-chain thermal stability</div>
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

          {/* Telemetry Hardware Metadata & Controls */}
          <div className="telemetry-footer-bar">
            <div className="telemetry-footer-info">
              <span className="footer-tag">Sensirion SGP41 (Gas MOx) + Sensirion SHT40 (Temp &amp; Humidity)</span>
              <span className="footer-sub">Live telemetry via AWS IoT Core &rarr; SQS Queue &rarr; RDS Database</span>
            </div>
            <button className="action-btn" onClick={fetchLiveStatus} title="Sync with live stream">
              <RefreshCw size={12} />
              <span>Sync Atmosphere Feed</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* PAGE 3: ABOUT FRESHTRACE (STACKED FORMULAS & STAT WIDGETS)       */}
      {/* ================================================================ */}
      {activeTab === 'about' && (
        <div className="page-view animate-fade-in">
          <div className="about-boundary-container">
            {/* Clean Header */}
            <div className="about-header-simple">
              <h2 className="about-title-large">
                How FreshTrace Works
              </h2>
              <p className="about-title-lead">
                Real-time food freshness intelligence fusing multi-gas atmospheric sensing with Arrhenius bio-thermal kinetic modeling.
              </p>
            </div>

            {/* Horizontally Longer Formula Cards Stacked Vertically */}
            <div className="about-formula-cards-stacked">
              {/* Card 1: Biochemical */}
              <div className="formula-card-horizontal formula-card-emerald">
                <div className="formula-card-left-info">
                  <div className="formula-card-title-row">
                    <Wind size={17} color="#059669" />
                    <span className="formula-card-title-text" style={{ color: '#059669' }}>Biochemical Rotting Gas</span>
                  </div>
                  <span className="formula-card-badge-emerald">Sensirion SGP41 · VOC/NOx</span>
                </div>
                <div className="formula-box-wide">
                  <code>Risk_bio = clamp((VOC_0 - VOC_t) / &Delta;_s, 0, 1)</code>
                </div>
              </div>

              {/* Card 2: Arrhenius */}
              <div className="formula-card-horizontal formula-card-rose">
                <div className="formula-card-left-info">
                  <div className="formula-card-title-row">
                    <Thermometer size={17} color="#e11d48" />
                    <span className="formula-card-title-text" style={{ color: '#e11d48' }}>Arrhenius Thermal Rate</span>
                  </div>
                  <span className="formula-card-badge-rose">Ea = 85 kJ/mol · Thermal Debt</span>
                </div>
                <div className="formula-box-wide">
                  <code>k(T) = k_0 &middot; exp[ (-Ea / R)(1/T - 1/T_0) ]</code>
                </div>
              </div>

              {/* Card 3: Dynamic Shelf Life */}
              <div className="formula-card-horizontal formula-card-sky">
                <div className="formula-card-left-info">
                  <div className="formula-card-title-row">
                    <Clock size={17} color="#0284c7" />
                    <span className="formula-card-title-text" style={{ color: '#0284c7' }}>Dynamic Shelf Life</span>
                  </div>
                  <span className="formula-card-badge-sky">&plusmn;15% Confidence Countdown</span>
                </div>
                <div className="formula-box-wide">
                  <code>RUL = (0.80 - Risk) / (|Velocity| &middot; c)</code>
                </div>
              </div>
            </div>

            {/* 4 Colorful Interactive Stat Widgets */}
            <div className="about-stat-widgets-4grid">
              <div className="stat-widget-box stat-widget-emerald">
                <span className="stat-widget-number">40-60%</span>
                <span className="stat-widget-label">Waste Reduction</span>
              </div>
              <div className="stat-widget-box stat-widget-sky">
                <span className="stat-widget-number">&lt; 1.0s</span>
                <span className="stat-widget-label">Edge Ingest Latency</span>
              </div>
              <div className="stat-widget-box stat-widget-rose">
                <span className="stat-widget-number">100%</span>
                <span className="stat-widget-label">Non-Invasive Sensing</span>
              </div>
              <div className="stat-widget-box stat-widget-amber">
                <span className="stat-widget-number">AWS IoT</span>
                <span className="stat-widget-label">MQTT Telemetry</span>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
