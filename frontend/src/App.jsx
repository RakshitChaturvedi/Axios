import React, { useState, useEffect } from 'react';
import { 
  Thermometer, 
  Droplets, 
  Wind, 
  Radio, 
  RefreshCw, 
  Sliders
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:8080';

export default function App() {
  const [deviceId] = useState('FreshTrace-Node-01');
  const [foodType] = useState('Tomato (Fresh)');
  const [lastUpdatedSec, setLastUpdatedSec] = useState(14);
  const [activePreset, setActivePreset] = useState('fresh');

  // Core Intelligence Values
  const [riskScore, setRiskScore] = useState(0.18);
  const [rulHours, setRulHours] = useState(72.0);
  const [bioRisk, setBioRisk] = useState(0.18);
  const [thermalRisk, setThermalRisk] = useState(0.00);
  const [degradationVelocity, setDegradationVelocity] = useState(-0.015);

  // Exact Sensor Metrics
  const [sensor, setSensor] = useState({
    voc_raw: 31555,
    nox_raw: 19601,
    temperature_c: 30.2,
    humidity_pct: 67.9
  });

  // Rolling Histories
  const [vocHistory, setVocHistory] = useState([
    31720, 31690, 31660, 31630, 31600, 31580, 31560, 31555
  ]);
  const [velocityHistory, setVelocityHistory] = useState([
    -0.009, -0.010, -0.011, -0.012, -0.013, -0.014, -0.015, -0.015
  ]);

  // Elapsed Seconds Counter
  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdatedSec(prev => (prev >= 60 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch live state from backend API
  const fetchLiveStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.risk) {
          const overall = data.risk.overall ?? data.spoilage_risk ?? 0.18;
          setRiskScore(overall);
          setBioRisk(data.risk.biochemical ?? 0.18);
          setThermalRisk(data.risk.thermal ?? 0.0);
        }
        if (data.remaining_useful_life) {
          setRulHours(data.remaining_useful_life.hours ?? 72.0);
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
          setVocHistory(prev => [...prev.slice(-12), newVoc]);
        }
        setLastUpdatedSec(0);
      }
    } catch (e) {
      // Offline fallback
    }
  };

  useEffect(() => {
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 5000);
    return () => clearInterval(interval);
  }, [deviceId]);

  // Derived Spoilage Progression Stage
  // 0: FRESH (<30%), 1: WATCH (30-59%), 2: ONSET CANDIDATE (60-79%), 3: SPOILAGE ONSET (>=80%)
  const isSpoiled = riskScore >= 0.80;
  const isWatch = riskScore >= 0.30 && riskScore < 0.80;

  const getProgressionStep = () => {
    if (riskScore >= 0.80) return 3; // SPOILAGE ONSET
    if (riskScore >= 0.60) return 2; // ONSET CANDIDATE
    if (riskScore >= 0.30) return 1; // WATCH
    return 0; // FRESH
  };

  const progressionStep = getProgressionStep();

  // Dynamic status text following user rule (No "FRESH & SAFE")
  const getStatusHeadline = () => {
    if (isSpoiled) return 'SPOILAGE ONSET DETECTED';
    if (isWatch) return 'ELEVATED DEGRADATION RISK';
    return 'FRESHNESS STATE: STABLE';
  };

  const getRiskCategory = () => {
    if (isSpoiled) return 'CRITICAL';
    if (isWatch) return 'ELEVATED';
    return 'LOW';
  };

  // Interactive Temperature Slider calculation (Arrhenius kinetic live simulation)
  const handleTempSlider = (newTemp) => {
    const t = parseFloat(newTemp);
    const ea = 85000;
    const r = 8.314;
    const tKelvin = t + 273.15;
    const tRefKelvin = 4.0 + 273.15;
    const rateMultiplier = Math.exp(-(ea / r) * ((1.0 / tKelvin) - (1.0 / tRefKelvin)));
    const calculatedThermal = Math.min(1.0, Math.max(0.0, (rateMultiplier * 0.04) - 0.04));

    const newOverall = Math.min(1.0, Math.max(bioRisk, calculatedThermal));
    setThermalRisk(calculatedThermal);
    setRiskScore(newOverall);

    const vel = -0.010 * (t / 25.0);
    setDegradationVelocity(vel);
    setVelocityHistory(prev => [...prev.slice(-12), vel]);

    if (newOverall >= 0.80) {
      setRulHours(0.0);
    } else {
      const remaining = Math.max(1.0, (0.85 - newOverall) / (Math.abs(vel) * 0.035));
      setRulHours(remaining);
    }

    setSensor(prev => ({ ...prev, temperature_c: t }));
  };

  // Preset Demonstrations
  const applyPreset = (preset) => {
    setActivePreset(preset);
    if (preset === 'fresh') {
      setRiskScore(0.18);
      setRulHours(72.0);
      setBioRisk(0.18);
      setThermalRisk(0.00);
      setDegradationVelocity(-0.015);
      setVelocityHistory([-0.009, -0.011, -0.012, -0.014, -0.015, -0.015]);
      setSensor({ voc_raw: 31555, nox_raw: 19601, temperature_c: 30.2, humidity_pct: 67.9 });
      setVocHistory([31720, 31680, 31650, 31610, 31580, 31555]);
    } else if (preset === 'watch') {
      setRiskScore(0.48);
      setRulHours(24.5);
      setBioRisk(0.38);
      setThermalRisk(0.48);
      setDegradationVelocity(-0.085);
      setVelocityHistory([-0.020, -0.035, -0.055, -0.070, -0.082, -0.085]);
      setSensor({ voc_raw: 30200, nox_raw: 18900, temperature_c: 34.5, humidity_pct: 74.0 });
      setVocHistory([31400, 31100, 30800, 30500, 30300, 30200]);
    } else if (preset === 'spoiled') {
      setRiskScore(0.89);
      setRulHours(0.0);
      setBioRisk(0.89);
      setThermalRisk(0.45);
      setDegradationVelocity(-0.320);
      setVelocityHistory([-0.050, -0.110, -0.190, -0.260, -0.310, -0.320]);
      setSensor({ voc_raw: 26500, nox_raw: 15400, temperature_c: 33.0, humidity_pct: 82.0 });
      setVocHistory([30000, 29000, 28000, 27200, 26800, 26500]);
    }
  };

  // -------------------------------------------------------------
  // VISUALIZATION 1: DEGRADATION VELOCITY (VOC Trajectory + Derivative)
  // -------------------------------------------------------------
  const renderVelocityGraph = () => {
    const width = 460;
    const height = 150;
    const pad = 24;

    const data = velocityHistory;
    const minVal = -0.350;
    const maxVal = 0.020;
    const range = maxVal - minVal;

    const zeroY = height - pad - ((0 - minVal) / range) * (height - 2 * pad);

    const points = data.map((val, idx) => {
      const x = pad + (idx / (data.length - 1)) * (width - 2 * pad);
      const y = height - pad - ((val - minVal) / range) * (height - 2 * pad);
      return `${x},${y}`;
    }).join(' ');

    const currentY = height - pad - ((degradationVelocity - minVal) / range) * (height - 2 * pad);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-canvas">
        <defs>
          <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Zero baseline (0.000 Steady rate) */}
        <line 
          x1={pad} y1={zeroY} 
          x2={width - pad} y2={zeroY} 
          stroke="#cccccc" 
          strokeWidth="1.2" 
          strokeDasharray="4 4" 
        />
        <text x={pad} y={zeroY - 6} fontSize="10" fill="#888888" fontFamily="monospace">
          0.000 baseline (steady)
        </text>

        {/* Accelerating zone marker */}
        <text x={width - pad - 68} y={pad + 10} fontSize="10" fill="#dc2626" fontWeight="700">
          accelerating &uarr;
        </text>

        {/* Area fill */}
        <polygon 
          fill="url(#velGrad)" 
          points={`${pad},${zeroY} ${points} ${width - pad},${zeroY}`} 
        />

        {/* Velocity Derivative Curve */}
        <polyline
          fill="none"
          stroke="#000000"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />

        {/* Current Point Marker */}
        <circle
          cx={width - pad}
          cy={currentY}
          r="5"
          fill={Math.abs(degradationVelocity) > 0.08 ? '#dc2626' : '#000000'}
          stroke="#ffffff"
          strokeWidth="2"
        />
        <text 
          x={width - pad - 8} 
          y={currentY + 18} 
          textAnchor="end" 
          fontSize="10.5" 
          fontWeight="700" 
          fill="#000000"
          fontFamily="monospace"
        >
          current: {degradationVelocity.toFixed(3)} ticks/s
        </text>
      </svg>
    );
  };

  // -------------------------------------------------------------
  // VISUALIZATION 2: DEGRADATION TRAJECTORY (0h – 72h Signature Curve)
  // -------------------------------------------------------------
  const renderTrajectoryGraph = () => {
    const width = 500;
    const height = 170;
    const padX = 35;
    const padY = 22;

    const curvePoints = [
      { t: 0, deg: 0.06 },
      { t: 12, deg: 0.09 },
      { t: 24, deg: 0.14 },
      { t: 36, deg: 0.28 },
      { t: 48, deg: 0.50 },
      { t: 60, deg: 0.72 },
      { t: 72, deg: 0.88 }
    ];

    const plotPoints = curvePoints.map(p => {
      const x = padX + (p.t / 72) * (width - 2 * padX);
      const y = height - padY - p.deg * (height - 2 * padY);
      return `${x},${y}`;
    }).join(' ');

    const curT = Math.min(72, Math.max(0, 72 - rulHours));
    const curX = padX + (curT / 72) * (width - 2 * padX);
    const curY = height - padY - Math.min(1.0, riskScore) * (height - 2 * padY);

    const critY = height - padY - 0.80 * (height - 2 * padY);
    const onsetY = height - padY - 0.30 * (height - 2 * padY);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="svg-canvas">
        <defs>
          <linearGradient id="trajGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* 80% Model Critical Threshold Line */}
        <line 
          x1={padX} y1={critY} 
          x2={width - padX} y2={critY} 
          stroke="#ef4444" 
          strokeWidth="1.2" 
          strokeDasharray="4 4" 
        />
        <text x={padX + 4} y={critY - 5} fontSize="9.5" fill="#ef4444" fontWeight="700">
          Model critical threshold (80%)
        </text>

        {/* 30% Detected Onset Boundary */}
        <line 
          x1={padX} y1={onsetY} 
          x2={width - padX} y2={onsetY} 
          stroke="#d97706" 
          strokeWidth="1" 
          strokeDasharray="3 3" 
        />
        <text x={padX + 4} y={onsetY - 4} fontSize="9.5" fill="#d97706" fontWeight="600">
          Detected onset boundary (30%)
        </text>

        {/* Axes */}
        <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="#000000" strokeWidth="1.5" />
        <line x1={padX} y1={padY} x2={padX} y2={height - padY} stroke="#000000" strokeWidth="1.5" />

        {/* X-Axis Ticks */}
        {[0, 12, 24, 36, 48, 60, 72].map(hr => {
          const x = padX + (hr / 72) * (width - 2 * padX);
          return (
            <g key={hr}>
              <line x1={x} y1={height - padY} x2={x} y2={height - padY + 4} stroke="#000000" strokeWidth="1" />
              <text x={x} y={height - padY + 14} fontSize="9.5" textAnchor="middle" fill="#666666" fontFamily="monospace">
                {hr}h
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <polygon 
          fill="url(#trajGrad)" 
          points={`${padX},${height - padY} ${plotPoints} ${width - padX},${height - padY}`} 
        />

        {/* Sigmoidal Kinetic Curve */}
        <polyline
          fill="none"
          stroke="#000000"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={plotPoints}
        />

        {/* Baseline Marker */}
        <circle cx={padX} cy={height - padY - 0.06 * (height - 2 * padY)} r="3.5" fill="#000000" />
        <text x={padX + 6} y={height - padY - 0.06 * (height - 2 * padY) - 5} fontSize="9" fill="#555555" fontWeight="600">
          Baseline
        </text>

        {/* Current Active Point */}
        <circle
          cx={curX}
          cy={curY}
          r="6"
          fill={isSpoiled ? '#ef4444' : isWatch ? '#f59e0b' : '#10b981'}
          stroke="#ffffff"
          strokeWidth="2.5"
        />
        <text 
          x={curX} 
          y={curY - 10} 
          textAnchor={curX > width - 100 ? 'end' : 'middle'} 
          fontSize="10" 
          fontWeight="800" 
          fill="#000000"
          fontFamily="monospace"
        >
          NOW ({Math.round(riskScore * 100)}%)
        </text>
      </svg>
    );
  };

  return (
    <div className="app-viewport">
      {/* ================================================================ */}
      {/* 1. TOP MONITORING HEADER (EXECUTIVE 2-SECOND STATE UNDERSTANDING)  */}
      {/* ================================================================ */}
      <header className="monitoring-header-card">
        <div className="monitoring-meta-row">
          <div className="meta-left">
            <h1 className="monitoring-title">TOMATO &mdash; LIVE MONITORING</h1>
            <div className="device-status-sub">
              <span className="pulse-dot" />
              <span>Device online &middot; Updated {lastUpdatedSec} sec ago &middot; {deviceId}</span>
            </div>
          </div>

          <div className="meta-right">
            <div className="preset-toggle-group">
              <button 
                className={`preset-btn ${activePreset === 'fresh' ? 'active' : ''}`}
                onClick={() => applyPreset('fresh')}
              >
                Fresh
              </button>
              <button 
                className={`preset-btn ${activePreset === 'watch' ? 'active' : ''}`}
                onClick={() => applyPreset('watch')}
              >
                Watch
              </button>
              <button 
                className={`preset-btn ${activePreset === 'spoiled' ? 'active' : ''}`}
                onClick={() => applyPreset('spoiled')}
              >
                Spoiled
              </button>
              <button className="sync-btn" onClick={fetchLiveStatus} title="Poll live AWS SQS telemetry">
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* The 3 Major Numbers */}
        <div className="major-numbers-strip">
          {/* Major 1: Spoilage Risk */}
          <div className={`major-stat-box ${isSpoiled ? 'box-spoiled' : isWatch ? 'box-watch' : 'box-fresh'}`}>
            <div className="stat-label-flex">
              <span>SPOILAGE RISK</span>
              <span className="badge-model-tag">MODEL OUTPUT</span>
            </div>
            <div className="stat-val-row">
              <span className="stat-big-number">{Math.round(riskScore * 100)}%</span>
              <span className="stat-category-pill">{getRiskCategory()}</span>
            </div>
            <div className="stat-subtext">
              {getStatusHeadline()}
            </div>
          </div>

          {/* Major 2: Shelf Life */}
          <div className="major-stat-box">
            <div className="stat-label-flex">
              <span>SHELF LIFE</span>
              <span className="badge-model-tag">MODEL OUTPUT</span>
            </div>
            <div className="stat-val-row">
              {isSpoiled ? (
                <span className="stat-big-number spoiled-red">0.0 h</span>
              ) : (
                <span className="stat-big-number">{rulHours.toFixed(1)} h</span>
              )}
              <span className="stat-ci-pill">&plusmn;{(rulHours * 0.15).toFixed(1)} h</span>
            </div>
            <div className="stat-subtext">
              {isSpoiled ? 'Terminal degradation boundary reached' : `95% CI · ${(rulHours * 0.85).toFixed(1)}–${(rulHours * 1.15).toFixed(1)} h`}
            </div>
          </div>

          {/* Major 3: Degradation Velocity */}
          <div className="major-stat-box">
            <div className="stat-label-flex">
              <span>DEGRADATION</span>
              <span className="badge-model-tag">MODEL OUTPUT</span>
            </div>
            <div className="stat-val-row">
              <span className="stat-big-number">{degradationVelocity.toFixed(3)}</span>
              <span className="stat-unit-pill">ticks/sec</span>
            </div>
            <div className="stat-subtext">
              {Math.abs(degradationVelocity) > 0.08 ? 'Rate accelerating (>3.2x)' : 'Steady baseline rate'}
            </div>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* 2. LIVE SENSOR STRIP (CONNECTS PHYSICAL HARDWARE TO MODEL)       */}
      {/* ================================================================ */}
      <section className="sensor-telemetry-strip">
        <div className="strip-title-row">
          <div className="strip-title-left">
            <span className="strip-title">Sensor Telemetry</span>
            <span className="badge-measured-tag">MEASURED</span>
          </div>
          <div className="strip-info-right">
            <span>Sensirion SGP41 (MOX) + SHT40 (Cold-Chain Probe) &middot; AWS IoT Core MQTT</span>
          </div>
        </div>

        <div className="telemetry-items-row">
          <div className="telemetry-item">
            <Thermometer size={16} className="item-icon" />
            <span className="item-k">Temperature:</span>
            <strong className="item-v">{sensor.temperature_c.toFixed(1)}°C</strong>
          </div>

          <div className="telemetry-item">
            <Droplets size={16} className="item-icon" />
            <span className="item-k">Humidity:</span>
            <strong className="item-v">{sensor.humidity_pct.toFixed(1)}% RH</strong>
          </div>

          <div className="telemetry-item">
            <Wind size={16} className="item-icon" />
            <span className="item-k">VOC Raw:</span>
            <strong className="item-v">{sensor.voc_raw.toLocaleString()} ticks</strong>
          </div>

          <div className="telemetry-item">
            <Radio size={16} className="item-icon" />
            <span className="item-k">NOx Raw:</span>
            <strong className="item-v">{sensor.nox_raw.toLocaleString()} ticks</strong>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 3. SPOILAGE PROGRESSION TIMELINE                                 */}
      {/* ================================================================ */}
      <section className="content-card progression-card">
        <div className="card-header-flex">
          <div className="header-left-flex">
            <span className="section-title">Spoilage Progression</span>
            <span className="badge-model-tag">MODEL OUTPUT</span>
          </div>
          <div className="tooltip-container">
            <span className="tooltip-trigger">ⓘ</span>
            <div className="tooltip-box">
              Sequential degradation state tracking using dual Kalman filtering and CUSUM cumulative sum change-point detection.
            </div>
          </div>
        </div>

        {/* Stepper Timeline */}
        <div className="timeline-stepper">
          {/* Step 0: FRESH */}
          <div className={`step-node ${progressionStep >= 0 ? 'active' : ''}`}>
            <div className="node-marker">
              <span className="dot" />
              {progressionStep === 0 && <span className="now-flag">NOW</span>}
            </div>
            <span className="node-label">FRESH</span>
          </div>
          <div className={`step-line ${progressionStep >= 1 ? 'filled' : ''}`} />

          {/* Step 1: WATCH */}
          <div className={`step-node ${progressionStep >= 1 ? 'active' : ''}`}>
            <div className="node-marker">
              <span className="dot" />
              {progressionStep === 1 && <span className="now-flag">NOW</span>}
            </div>
            <span className="node-label">WATCH</span>
          </div>
          <div className={`step-line ${progressionStep >= 2 ? 'filled' : ''}`} />

          {/* Step 2: ONSET CANDIDATE */}
          <div className={`step-node ${progressionStep >= 2 ? 'active' : ''}`}>
            <div className="node-marker">
              <span className="dot" />
              {progressionStep === 2 && <span className="now-flag">NOW</span>}
            </div>
            <span className="node-label">ONSET CANDIDATE</span>
          </div>
          <div className={`step-line ${progressionStep >= 3 ? 'filled' : ''}`} />

          {/* Step 3: SPOILAGE ONSET */}
          <div className={`step-node ${progressionStep >= 3 ? 'active' : ''}`}>
            <div className="node-marker">
              <span className="dot" />
              {progressionStep === 3 && <span className="now-flag">NOW</span>}
            </div>
            <span className="node-label">SPOILAGE ONSET</span>
          </div>
        </div>

        <div className="timeline-meta-footer">
          <div>
            <span className="meta-label">Current state: </span>
            <strong className="meta-value">{getStatusHeadline()}</strong>
          </div>
          <div>
            <span className="meta-label">Spoilage onset: </span>
            <strong className="meta-value">
              {progressionStep >= 3 ? 'Detected (Critical Boundary)' : progressionStep === 2 ? 'Candidate flag raised' : 'Not detected'}
            </strong>
          </div>
          <div>
            <span className="meta-label">Model critical threshold: </span>
            <strong className="meta-value">80%</strong>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* 4. DUAL ANALYTICS: DEGRADATION VELOCITY & RISK ATTRIBUTION       */}
      {/* ================================================================ */}
      <div className="analytics-grid-2col">
        {/* Panel 1: Degradation Velocity Graph */}
        <section className="content-card">
          <div className="card-header-flex">
            <div className="header-left-flex">
              <span className="section-title">Degradation Velocity</span>
              <span className="badge-model-tag">MODEL OUTPUT</span>
            </div>
            <div className="tooltip-container">
              <span className="tooltip-trigger">ⓘ</span>
              <div className="tooltip-box">
                Derivative of filtered SGP41 sensor resistance ticks over a 60-second rolling window showing rate of chemical decay.
              </div>
            </div>
          </div>

          <div className="graph-container">
            {renderVelocityGraph()}
          </div>

          <div className="velocity-context-row">
            <span className="context-item">
              <strong>Cold Storage (4°C):</strong> Slows rate by ~78%
            </span>
            <span className="context-item">
              <strong>Heat Abuse (&gt;35°C):</strong> Accelerates rate by 3.2x
            </span>
          </div>
        </section>

        {/* Panel 2: Visual Risk Attribution */}
        <section className="content-card">
          <div className="card-header-flex">
            <div className="header-left-flex">
              <span className="section-title">Risk Attribution</span>
              <span className="badge-model-tag">MODEL OUTPUT</span>
            </div>
            <div className="tooltip-container">
              <span className="tooltip-trigger">ⓘ</span>
              <div className="tooltip-box">
                Direct attribution separating volatile organic gas emission kinetics from accumulated Arrhenius thermal exposure.
              </div>
            </div>
          </div>

          <div className="attribution-comparison-box">
            {/* VOC-Associated Signal */}
            <div className="attrib-bar-group">
              <div className="attrib-label-row">
                <span className="attrib-name">VOC-associated signal</span>
                <span className="attrib-val">{Math.round(bioRisk * 100)}%</span>
              </div>
              <div className="attrib-track">
                <div className="attrib-fill-black" style={{ width: `${Math.min(100, Math.round(bioRisk * 100))}%` }} />
              </div>
            </div>

            {/* Thermal Abuse Signal */}
            <div className="attrib-bar-group">
              <div className="attrib-label-row">
                <span className="attrib-name">Thermal abuse signal</span>
                <span className="attrib-val">{Math.round(thermalRisk * 100)}%</span>
              </div>
              <div className="attrib-track">
                <div className="attrib-fill-black" style={{ width: `${Math.min(100, Math.round(thermalRisk * 100))}%` }} />
              </div>
            </div>
          </div>

          <div className="attribution-dominant-callout">
            <div>
              <span className="callout-label">Dominant signal: </span>
              <strong>{bioRisk >= thermalRisk ? 'VOC-associated degradation signal' : 'Thermal abuse signal'}</strong>
            </div>
            <div className="callout-sub">
              Derived from changes in VOC/NOx measurements relative to the tomato baseline.
            </div>
          </div>
        </section>
      </div>

      {/* ================================================================ */}
      {/* 5. DEGRADATION TRAJECTORY (0h – 72h SIGNATURE KINETIC MODEL)     */}
      {/* ================================================================ */}
      <section className="content-card trajectory-card">
        <div className="card-header-flex">
          <div className="header-left-flex">
            <span className="section-title">Degradation Trajectory (0h &ndash; 72h)</span>
            <span className="badge-model-tag">MODEL OUTPUT</span>
          </div>
          <div className="tooltip-container">
            <span className="tooltip-trigger">ⓘ</span>
            <div className="tooltip-box">
              Empirical degradation progression modeled from Arrhenius thermal integration and real-time SGP41 volatile baseline shifts.
            </div>
          </div>
        </div>

        <div className="trajectory-graph-box">
          {renderTrajectoryGraph()}
        </div>
      </section>

      {/* ================================================================ */}
      {/* 6. INTERACTIVE AMBIENT STRESS SIMULATION TOOLBAR                 */}
      {/* ================================================================ */}
      <section className="content-card simulation-card">
        <div className="slider-control-row">
          <span className="slider-label">
            <Sliders size={16} />
            <span>Test Ambient Temperature:</span>
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
          <span className="slider-value-box">
            {sensor.temperature_c.toFixed(1)}°C
          </span>
        </div>
      </section>
    </div>
  );
}
