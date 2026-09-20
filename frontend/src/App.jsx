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

const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) ||
  (typeof window !== 'undefined' && window.location.port !== '5180' && window.location.port !== '5173' && window.location.origin.startsWith('http')
    ? window.location.origin
    : (import.meta.env.VITE_API_BASE || 'http://localhost:8080'));

export default function App() {
  const [deviceId] = useState('FreshTrace-Node-01');
  const [foodType, setFoodType] = useState('tomato');
  const [activeTab, setActiveTab] = useState('factors'); // 'factors' | 'telemetry'

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

  // Live Timestamp Tracking
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

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
        setLastUpdated(new Date());
        setSecondsAgo(0);
      }
    } catch (e) {
      // Backend polling fallback
    }
  };

  // Poll API every 4 seconds and increment elapsed seconds every second
  useEffect(() => {
    fetchLiveStatus();
    const pollInterval = setInterval(fetchLiveStatus, 4000);
    const tickInterval = setInterval(() => {
      setSecondsAgo(prev => prev + 1);
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
            <span>Telemetry Stream</span>
          </button>
        </nav>

        <div className="header-status-group">
          <div className="live-pill">
            <span className="live-dot" />
            <span>AWS IoT Core Active · {deviceId}</span>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* PAGE 1: CORE SPOILAGE FACTORS (DEDICATED VIEW)                   */}
      {/* ================================================================ */}
      {/* ================================================================ */}
      {/* PAGE 1: CORE SPOILAGE FACTORS (DEDICATED VIEW)                   */}
      {/* ================================================================ */}
      {activeTab === 'factors' && (
        <div className="page-view animate-fade-in">
          <section className="factors-section">
            {/* LEVEL 1: Spoilage Risk Score (Centered Hero Card in Middle) */}
            <div className="factor-center-wrapper">
              <div className={`factor-card-center-hero ${getRiskCardClass()}`}>
                <div className="hero-center-content">
                  <div className="factor-card-title-center">
                    <span>Spoilage Risk Score</span>
                    {isSpoiled ? <AlertOctagon size={22} /> : isWatch ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}
                  </div>

                  <div className="risk-metric-hero-big">
                    {Math.round(riskScore * 100)}%
                  </div>

                  <div className="card-meta-text-center">
                    {isSpoiled 
                      ? `The food is spoiled. Spoilage risk has reached ${Math.round(riskScore * 100)}%. It is no longer safe to eat or sell.`
                      : isWatch 
                      ? `Use caution. The food is starting to deteriorate, with a ${Math.round(riskScore * 100)}% risk of spoilage.`
                      : `The food is fresh and safe to eat. There is an ${Math.round(riskScore * 100)}% risk that it is spoiled.`
                    }
                  </div>

                  <div className="card-hero-status-pill">
                    <span>Status:</span>
                    <strong>{isSpoiled ? "Spoiled" : isWatch ? "Needs Attention" : "Fresh & Safe"}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* LEVEL 2: Remaining Useful Shelf Life & Degradation Velocity (Below Hero) */}
            <div className="factors-mid-grid">
              {/* Remaining Useful Shelf Life */}
              <div className="factor-card factor-card-shelflife">
                <div>
                  <div className="factor-card-title">
                    <span style={{ color: '#0369a1' }}>Remaining Useful Shelf Life</span>
                    <Clock size={18} color="#0284c7" />
                  </div>

                  {isSpoiled ? (
                    <div className="spoiled-state-banner">
                      <div className="spoiled-state-title">
                        <AlertOctagon size={24} />
                        <span>SPOILED</span>
                      </div>
                      <div className="spoiled-state-desc">
                        Shelf life has expired. The food is spoiled and no longer safe to eat.
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="shelf-life-metric">
                        {rulHours.toFixed(1)} <span className="shelf-life-unit">Hours Left</span>
                      </div>
                      <div className="confidence-chip-blue">
                        <span>Expected window:</span>
                        <strong>{(rulHours * 0.85).toFixed(0)} to {(rulHours * 1.15).toFixed(0)} hours</strong>
                      </div>
                      <div className="card-meta-text" style={{ marginTop: '12px' }}>
                        How much time you have left before this food spoils under current storage conditions.
                      </div>
                    </div>
                  )}
                </div>

                <div className="card-footer-subtle">
                  <span>Safe Limit:</span>
                  <strong>Becomes unsafe when risk crosses 80%</strong>
                </div>
              </div>

              {/* Degradation Velocity (Strictly Black & White Card, No Graph) */}
              <div className="factor-card factor-card-velocity-bw">
                <div>
                  <div className="factor-card-title">
                    <span style={{ color: '#000000' }}>Degradation Velocity</span>
                    <Activity size={18} color="#000000" />
                  </div>

                  <div className="velocity-readout-row">
                    <span className="velocity-number">
                      {degradationVelocity.toFixed(3)}
                    </span>
                    <span className="velocity-unit">ticks/sec</span>
                    <span className="velocity-status-bw">
                      {Math.abs(degradationVelocity) > 0.1 ? 'Spoiling Fast' : 'Aging Slowly & Steady'}
                    </span>
                  </div>

                  <div className="card-meta-text" style={{ marginBottom: '14px' }}>
                    Shows how fast the food is breaking down right now based on temperature and gas readings.
                  </div>

                  {/* Clean Black & White Scenarios */}
                  <div className="scenario-list-bw">
                    <div className="scenario-item-bw">
                      <Snowflake size={15} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span><strong>In Fridge (4°C):</strong> Spoilage slows down by ~78%, lasting up to 5x longer.</span>
                    </div>
                    <div className="scenario-item-bw">
                      <Leaf size={15} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span><strong>Room Temperature:</strong> Follows standard steady aging rate.</span>
                    </div>
                    <div className="scenario-item-bw">
                      <SunMedium size={15} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                      <span><strong>In Heat (&gt;35°C):</strong> Spoilage speeds up 3x and spoils in 4 to 6 hours.</span>
                    </div>
                  </div>
                </div>

                <div className="card-footer-subtle">
                  <span>Aging Speed:</span>
                  <strong>{Math.abs(degradationVelocity) > 0.1 ? 'Accelerated' : 'Slow & Normal'}</strong>
                </div>
              </div>
            </div>

            {/* LEVEL 3: Thermal vs. Biochemical Risk (At Last, with Vibrant Color Meters) */}
            <div className="factor-card factor-card-risks" style={{ marginTop: '20px' }}>
              <div className="factor-card-title">
                <span style={{ color: '#047857' }}>Thermal vs. Biochemical Risk</span>
                <Layers size={18} color="#059669" />
              </div>

              <div className="vector-split-grid">
                {/* Biochemical Rotting Gas Risk */}
                <div className="vector-color-box vector-box-bio">
                  <div className="vector-row-header">
                    <div className="vector-title-group">
                      <Wind size={16} color="#059669" />
                      <span className="vector-name-colored" style={{ color: '#047857' }}>Rotting Gas Risk (Biochemical)</span>
                    </div>
                    <span className="vector-percent-green">{Math.round(bioRisk * 100)}%</span>
                  </div>
                  <div className="vector-sentence">
                    Measures natural gases released when bacteria start decomposing the food.
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill-bio-green" style={{ width: `${Math.min(100, Math.round(bioRisk * 100))}%` }} />
                  </div>
                </div>

                {/* Thermal Heat Damage Risk */}
                <div className="vector-color-box vector-box-thermal">
                  <div className="vector-row-header">
                    <div className="vector-title-group">
                      <Thermometer size={16} color="#dc2626" />
                      <span className="vector-name-colored" style={{ color: '#b91c1c' }}>Heat Damage Risk (Thermal)</span>
                    </div>
                    <span className="vector-percent-red">{Math.round(thermalRisk * 100)}%</span>
                  </div>
                  <div className="vector-sentence">
                    Measures heat damage built up over time from warm storage environments.
                  </div>
                  <div className="meter-track">
                    <div className="meter-fill-thermal-red" style={{ width: `${Math.min(100, Math.round(thermalRisk * 100))}%` }} />
                  </div>
                </div>
              </div>

              <div className="card-footer-subtle" style={{ marginTop: '16px' }}>
                <span>Main cause of spoilage:</span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {bioRisk > thermalRisk ? "Rotting gas buildup from aging" : "Heat exposure from warm storage"}
                </strong>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ================================================================ */}
      {/* PAGE 2: TELEMETRY STREAM & SENSOR CURVES (DEDICATED VIEW)        */}
      {/* ================================================================ */}
      {activeTab === 'telemetry' && (
        <div className="page-view animate-fade-in">
          {/* SENSOR LIVE UPDATE TIMESTAMP BANNER */}
          <div className="telemetry-live-banner">
            <div className="telemetry-timestamp-group">
              <span className="live-ping-dot" />
              <span className="telemetry-updated-text">
                Sensor data updated: <strong>{secondsAgo === 0 ? 'Just now' : `${secondsAgo}s ago`}</strong> ({lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
              </span>
            </div>
            <div className="telemetry-actions-group">
              <span className="telemetry-device-tag">Sensirion SGP41 + SHT40 Hardware Active</span>
              <button className="action-btn" onClick={fetchLiveStatus} title="Refresh sensor data">
                <RefreshCw size={12} />
                <span>Refresh Now</span>
              </button>
            </div>
          </div>

          {/* SENSOR METRICS 4-GRID WITH LOGICAL COLOR ACCENTS */}
          <section className="sensor-section">
            <div className="sensor-grid-4">
              {/* VOC Raw Sensor (Emerald Green) */}
              <div className="sensor-metric-card sensor-card-voc">
                <div className="sensor-name">
                  <span style={{ color: '#059669' }}>VOC Gas Sensor</span>
                  <Wind size={16} color="#059669" />
                </div>
                <div className="sensor-numeric-value">{sensor.voc_raw.toLocaleString()}</div>
                <div className="sensor-sub-caption">Rotting gases in storage air</div>
              </div>

              {/* NOx Raw Ticks (Violet / Purple) */}
              <div className="sensor-metric-card sensor-card-nox">
                <div className="sensor-name">
                  <span style={{ color: '#7c3aed' }}>NOx Gas Sensor</span>
                  <Radio size={16} color="#7c3aed" />
                </div>
                <div className="sensor-numeric-value">{sensor.nox_raw.toLocaleString()}</div>
                <div className="sensor-sub-caption">Nitrogen compounds in air</div>
              </div>

              {/* Temperature (Warm Coral / Orange) */}
              <div className="sensor-metric-card sensor-card-temp">
                <div className="sensor-name">
                  <span style={{ color: '#ea580c' }}>Storage Temperature</span>
                  <Thermometer size={16} color="#ea580c" />
                </div>
                <div className="sensor-numeric-value">{sensor.temperature_c.toFixed(1)}°C</div>
                <div className="sensor-sub-caption">Cold-chain storage reading</div>
              </div>

              {/* Humidity (Sky Blue) */}
              <div className="sensor-metric-card sensor-card-humidity">
                <div className="sensor-name">
                  <span style={{ color: '#0284c7' }}>Relative Humidity</span>
                  <Droplets size={16} color="#0284c7" />
                </div>
                <div className="sensor-numeric-value">{sensor.humidity_pct.toFixed(1)}%</div>
                <div className="sensor-sub-caption">Moisture level around produce</div>
              </div>
            </div>
          </section>

          {/* SECTION 3: SENSOR CURVES */}
          <section className="curves-section">
            <div className="curves-grid-2">
              {/* VOC Gas Degradation Curve */}
              <div className="curve-chart-card curve-card-voc-accent">
                <div className="curve-card-top">
                  <div>
                    <div className="curve-main-title">Gas Level Curve Over Time</div>
                    <div className="curve-subtitle-desc">Measures release of decomposition gases</div>
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
                    <div className="curve-main-title">Storage Temperature History</div>
                    <div className="curve-subtitle-desc">Tracks temperature stability and heat spikes</div>
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
              <span className="footer-tag">Sensirion SGP41 (Gas Sensor) + Sensirion SHT40 (Temp &amp; Humidity)</span>
              <span className="footer-sub">Real-time data stream via AWS IoT Core &rarr; SQS &rarr; Cloud Database</span>
            </div>
            <button className="action-btn" onClick={fetchLiveStatus} title="Sync with live stream">
              <RefreshCw size={14} />
              <span>Sync Sensor Feed</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
