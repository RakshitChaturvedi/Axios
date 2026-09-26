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
  BarChart3,
  Bell,
  Mail,
  Phone,
  Monitor
} from 'lucide-react';
import './App.css';

const getApiBase = () => {
  if (typeof window === 'undefined') return 'http://13.233.158.144:8080';
  if (window.__API_BASE__) return window.__API_BASE__;
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  
  // When running on Cloudflare HTTPS Tunnel, EC2 direct, or same-origin deployment
  if (
    window.location.hostname.includes('trycloudflare.com') ||
    window.location.hostname === '13.233.158.144' ||
    window.location.port === '8080' ||
    window.location.port === '80'
  ) {
    return window.location.origin;
  }

  // Fallback for S3 bucket website or local dev server (localhost:5180)
  return 'http://13.233.158.144:8080';
};

const API_BASE = getApiBase();

export default function App() {
  const [deviceId] = useState('FreshTrace-Node-01');
  const [foodType, setFoodType] = useState('tomato');
  const [activeTab, setActiveTab] = useState('factors'); // 'factors' | 'telemetry' | 'about'

  // Core Intelligence Values (Minimum risk floor of 4.5% even in optimal conditions)
  const [riskScore, setRiskScore] = useState(0.048);
  const [rulHours, setRulHours] = useState(72.0);
  const [bioRisk, setBioRisk] = useState(0.048);
  const [thermalRisk, setThermalRisk] = useState(0.020);
  const [degradationVelocity, setDegradationVelocity] = useState(-0.002);

  // Exact Sensor Metrics
  const [sensor, setSensor] = useState({
    voc_raw: 31521,
    nox_raw: 16769,
    temperature_c: 29.8,
    humidity_pct: 67.5
  });

  // Timestamped Rolling History for Time-Series Curves
  const [vocHistory, setVocHistory] = useState(() => {
    const now = new Date();
    return [31720, 31690, 31660, 31630, 31600, 31580, 31560, 31521].map((v, i) => {
      const d = new Date(now.getTime() - (7 - i) * 15000);
      return {
        value: v,
        timeStr: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        time: d
      };
    });
  });

  const [tempHistory, setTempHistory] = useState(() => {
    const now = new Date();
    return [29.4, 29.5, 29.6, 29.7, 29.7, 29.8, 29.8, 29.8].map((v, i) => {
      const d = new Date(now.getTime() - (7 - i) * 15000);
      return {
        value: v,
        timeStr: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        time: d
      };
    });
  });

  const [velocityHistory, setVelocityHistory] = useState([
    -0.001, -0.001, -0.002, -0.002, -0.002, -0.002, -0.002, -0.002
  ]);

  // Live Timestamp & Connection Tracking
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Hover state for interactive time markers on charts
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // AWS SNS & Browser Notification State
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);
  const [subProtocol, setSubProtocol] = useState('browser'); // 'browser' | 'email' | 'sms'
  const [subEndpoint, setSubEndpoint] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subResult, setSubResult] = useState(null);
  const [browserNotifPermission, setBrowserNotifPermission] = useState(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  });
  const [lastNotifSentAt, setLastNotifSentAt] = useState(0);

  // Request native OS/Browser notification permissions
  const requestBrowserNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setSubResult({ success: false, message: 'Native browser notifications are not supported by this browser.' });
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setBrowserNotifPermission(permission);
      if (permission === 'granted') {
        setSubResult({ success: true, message: '🎉 Browser notifications enabled! You will receive instant desktop alerts whenever Spoilage Risk reaches 80%.' });
        try {
          new Notification("FreshTrace · Browser Alerts Active", {
            body: "Instant desktop alerts connected to FreshTrace-Node-01 (Risk ≥ 80%).",
            icon: "/favicon.ico"
          });
        } catch (e) {}
      } else if (permission === 'denied') {
        setSubResult({ success: false, message: 'Notification permission was denied. Please allow notifications in your browser URL bar settings.' });
      }
    } catch (err) {
      setSubResult({ success: false, message: 'Failed to request notification permission.' });
    }
  };

  // Dispatch a test desktop notification
  const sendTestBrowserNotification = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification("🚨 FreshTrace Critical Alert (Test)", {
          body: "SIMULATED WARNING: Spoilage risk at 89%! Biochemical VOC threshold exceeded.",
          icon: "/favicon.ico"
        });
        setSubResult({ success: true, message: 'Test notification sent directly to your OS / desktop notification center!' });
      } catch (e) {
        setSubResult({ success: false, message: 'Error triggering desktop notification.' });
      }
    } else {
      requestBrowserNotificationPermission();
    }
  };

  // Automatically trigger native browser desktop notification whenever Risk >= 80%
  useEffect(() => {
    if (riskScore >= 0.80 && browserNotifPermission === 'granted') {
      const now = Date.now();
      if (now - lastNotifSentAt > 60000) { // 60s cooldown
        setLastNotifSentAt(now);
        try {
          new Notification(`🚨 CRITICAL SPOILAGE DETECTED: ${Math.round(riskScore * 100)}% RISK`, {
            body: `FreshTrace Node-01 has detected severe spoilage conditions (${Math.round(riskScore * 100)}% Spoilage Risk). Immediate cold-chain inspection or refrigeration required.`,
            icon: "/favicon.ico",
            tag: 'freshtrace-spoilage-alert'
          });
        } catch (e) {
          console.warn("Browser notification trigger notice:", e);
        }
      }
    }
  }, [riskScore, browserNotifPermission, lastNotifSentAt]);

  // Fetch telemetry history from RDS to populate historical time-series curves
  const fetchTelemetryHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}/telemetry/history?limit=20`);
      if (res.ok) {
        const historyData = await res.json();
        if (Array.isArray(historyData) && historyData.length > 0) {
          const vList = historyData.map(item => {
            const d = item.received_at ? new Date(item.received_at) : new Date();
            return {
              value: item.voc_raw,
              timeStr: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              time: d
            };
          });
          const tList = historyData.map(item => {
            const d = item.received_at ? new Date(item.received_at) : new Date();
            return {
              value: item.temperature_c,
              timeStr: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              time: d
            };
          });
          setVocHistory(vList);
          setTempHistory(tList);
        }
      }
    } catch (e) {
      console.warn("Telemetry history fetch notice:", e);
    }
  };

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

        // Apply minimum risk floor of 4.5%
        if (data.risk) {
          const overall = Math.max(0.045, data.risk.overall ?? data.spoilage_risk ?? 0.048);
          setRiskScore(overall);
          setBioRisk(Math.max(0.045, data.risk.biochemical ?? 0.048));
          setThermalRisk(Math.max(0.020, data.risk.thermal ?? 0.020));
        }
        if (data.remaining_useful_life) {
          setRulHours(data.remaining_useful_life.hours ?? 72.0);
        }
        if (data.sensor) {
          const newTemp = data.sensor.temperature_c ?? 29.8;
          const newVoc = data.sensor.voc_raw ?? 31521;
          const newNox = data.sensor.nox_raw ?? 16769;
          const newHum = data.sensor.humidity_pct ?? 67.5;
          setSensor({
            voc_raw: newVoc,
            nox_raw: newNox,
            temperature_c: newTemp,
            humidity_pct: newHum
          });

          const curTime = data.last_updated ? new Date(data.last_updated) : new Date();
          const timeString = curTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          setVocHistory(prev => {
            const next = [...prev, { value: newVoc, timeStr: timeString, time: curTime }];
            return next.slice(-20);
          });
          setTempHistory(prev => {
            const next = [...prev, { value: newTemp, timeStr: timeString, time: curTime }];
            return next.slice(-20);
          });
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

  // Subscribe to AWS SNS Spoilage Alerts (Risk >= 80%)
  const handleSubscribeSNS = async (e) => {
    e?.preventDefault();
    if (!subEndpoint || !subEndpoint.trim()) return;
    setSubLoading(true);
    setSubResult(null);
    try {
      const res = await fetch(`${API_BASE}/notifications/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: subProtocol,
          endpoint: subEndpoint.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSubResult({ success: true, message: data.message });
      } else {
        setSubResult({ success: false, message: data.detail || 'Failed to subscribe to AWS SNS.' });
      }
    } catch (err) {
      setSubResult({ success: false, message: 'Network error communicating with AWS SNS API.' });
    } finally {
      setSubLoading(false);
    }
  };

  // Poll API every 4 seconds and increment elapsed seconds every second
  useEffect(() => {
    fetchTelemetryHistory();
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

      // Fire AWS SNS Alert to all confirmed cloud subscribers (Email/SMS)
      fetch(`${API_BASE}/notifications/publish-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, risk_score: 0.89, reason: 'Demo Preset: Spoiled and Hazardous' })
      }).catch(e => console.warn("AWS SNS publish notice:", e));
    }
    setLastUpdated(new Date());
    setSecondsAgo(0);
  };

  // Mathematically Scaled SVG Sparkline with Dynamic Time-Axes, Grids, and Interactive Tooltips
  const renderSVGChart = (data, strokeColor = '#10b981', unit = 'ticks', minBound, maxBound, chartId = 'voc') => {
    if (!data || data.length === 0) return null;

    // Normalize data entries to objects { value, timeStr, time }
    const items = data.map((d, i) => {
      if (typeof d === 'object' && d !== null) return d;
      const t = new Date(Date.now() - (data.length - 1 - i) * 10000);
      return {
        value: Number(d),
        timeStr: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        time: t
      };
    });

    const values = items.map(d => d.value);
    const min = minBound ?? (Math.min(...values) * 0.995);
    const max = maxBound ?? (Math.max(...values) * 1.005);
    const range = (max - min) === 0 ? 1 : (max - min);

    const width = 560;
    const height = 150;
    const padX = 24;
    const padTop = 18;
    const padBottom = 30; // Dedicated space for formatted timestamps on the X-axis
    const chartHeight = height - padTop - padBottom;
    const chartWidth = width - 2 * padX;

    const coords = items.map((item, idx) => {
      const x = items.length === 1 ? padX + chartWidth / 2 : padX + (idx / (items.length - 1)) * chartWidth;
      const y = padTop + chartHeight - ((item.value - min) / range) * chartHeight;
      return { x, y, item, idx };
    });

    const pointsStr = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const safeColorId = strokeColor.replace(/[^a-zA-Z0-9]/g, '');
    const gradId = `chartGrad-${safeColorId}-${chartId}`;

    // Select 3 or 4 timestamp labels across the X axis
    const labelIndices = [];
    if (items.length === 1) {
      labelIndices.push(0);
    } else if (items.length <= 4) {
      items.forEach((_, i) => labelIndices.push(i));
    } else {
      labelIndices.push(0);
      labelIndices.push(Math.floor(items.length / 3));
      labelIndices.push(Math.floor((items.length * 2) / 3));
      labelIndices.push(items.length - 1);
    }

    const firstTime = items[0]?.timeStr || '--:--:--';
    const lastTime = items[items.length - 1]?.timeStr || '--:--:--';

    return (
      <div className="svg-chart-container" style={{ position: 'relative', width: '100%' }}>
        <svg 
          viewBox={`0 0 ${width} ${height}`} 
          style={{ width: '100%', height: '100%', overflow: 'visible' }}
          className="metric-timeseries-svg"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Background Horizontal Reference Grid Lines */}
          <line x1={padX} y1={padTop} x2={width - padX} y2={padTop} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
          <line x1={padX} y1={padTop + chartHeight / 2} x2={width - padX} y2={padTop + chartHeight / 2} stroke="#f1f5f9" strokeDasharray="3 3" strokeWidth="1" />
          <line x1={padX} y1={padTop + chartHeight} x2={width - padX} y2={padTop + chartHeight} stroke="#cbd5e1" strokeWidth="1.2" />

          {/* Gradient Fill Area */}
          {coords.length > 1 && (
            <polygon 
              fill={`url(#${gradId})`} 
              points={`${coords[0].x},${padTop + chartHeight} ${pointsStr} ${coords[coords.length - 1].x},${padTop + chartHeight}`} 
            />
          )}

          {/* Polyline Trajectory Curve */}
          {coords.length > 1 && (
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsStr}
            />
          )}

          {/* Individual Data Points & Timestamp Tick Marks */}
          {coords.map((c, i) => {
            const isHovered = hoveredPoint && hoveredPoint.chartId === chartId && hoveredPoint.idx === i;
            const isLast = i === coords.length - 1;
            const showTick = labelIndices.includes(i);

            return (
              <g key={i}>
                {/* Vertical time grid tick line */}
                {showTick && (
                  <line
                    x1={c.x}
                    y1={padTop + chartHeight}
                    x2={c.x}
                    y2={padTop + chartHeight + 4}
                    stroke="#94a3b8"
                    strokeWidth="1.5"
                  />
                )}

                {/* X-Axis Formatted Timestamp Label */}
                {showTick && (
                  <text
                    x={c.x}
                    y={height - 8}
                    textAnchor={i === 0 ? 'start' : i === coords.length - 1 ? 'end' : 'middle'}
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="var(--font-mono, monospace)"
                    fontWeight="600"
                  >
                    {c.item.timeStr}
                  </text>
                )}

                {/* Interactive Data Point Dot */}
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={isHovered ? 6.5 : isLast ? 5 : 3.5}
                  fill={isHovered ? '#ffffff' : strokeColor}
                  stroke={isHovered ? strokeColor : '#ffffff'}
                  strokeWidth={isHovered ? 3 : 2}
                  style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                  onMouseEnter={() => setHoveredPoint({ chartId, idx: i, ...c.item, x: c.x, y: c.y, unit })}
                  onMouseLeave={() => setHoveredPoint(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay showing Value + Exact Timestamp */}
        {hoveredPoint && hoveredPoint.chartId === chartId && (
          <div 
            className="chart-hover-tooltip"
            style={{
              position: 'absolute',
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${Math.max(0, (hoveredPoint.y / height) * 100 - 32)}%`,
              transform: 'translate(-50%, -100%)',
              pointerEvents: 'none',
              zIndex: 10
            }}
          >
            <div className="tooltip-val" style={{ color: strokeColor }}>
              {typeof hoveredPoint.value === 'number' ? hoveredPoint.value.toLocaleString() : hoveredPoint.value} {hoveredPoint.unit}
            </div>
            <div className="tooltip-time">
              🕒 {hoveredPoint.timeStr}
            </div>
          </div>
        )}

        {/* Timeline Summary Strip below graph */}
        <div className="chart-timeline-strip">
          <div className="timeline-strip-item">
            <span className="timeline-strip-dot" />
            <span>Timeline Start: <strong>{firstTime}</strong></span>
          </div>
          <div className="timeline-strip-item">
            <span className="timeline-strip-dot active-dot" style={{ backgroundColor: strokeColor }} />
            <span>Latest Reading: <strong>{lastTime}</strong></span>
          </div>
        </div>
      </div>
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
            {/* AWS SNS Notification Trigger & Registration Button */}
            <button 
              className="aws-sns-subscribe-btn"
              onClick={() => setSubscribeModalOpen(true)}
              title="Configure instant AWS SNS Email/SMS alerts when spoilage risk exceeds 80%"
            >
              <Bell size={14} className="bell-icon-pulse" />
              <span>AWS Alerts (Risk ≥ 80%)</span>
            </button>

            <div className={`live-pill ${isOnline ? 'pill-online' : 'pill-offline'}`}>
              <span className={`live-dot ${isOnline ? 'dot-online' : 'dot-offline'}`} />
              <span>{isOnline ? `AWS IoT Core Active · ${deviceId}` : `Sensor Offline · Standby (${deviceId})`}</span>
            </div>
          </div>
        </header>

        {/* TOP CRITICAL AWS ALERT BANNER (Triggers automatically when Risk >= 80%) */}
        {isSpoiled && (
          <div className="critical-sns-alert-banner animate-fade-in">
            <div className="alert-content-group">
              <div className="alert-icon-wrap">
                <AlertOctagon size={22} color="#ffffff" className="alert-icon-pulse" />
              </div>
              <div className="alert-text-group">
                <div className="alert-title-main">
                  🚨 CRITICAL SPOILAGE DETECTED: {Math.round(riskScore * 100)}% RISK LEVEL (≥ 80% Threshold Exceeded)
                </div>
                <div className="alert-subtitle-detail">
                  Automated high-priority alert dispatched via Amazon SNS to cloud subscribers. Immediate cold-chain inspection or refrigeration required.
                </div>
              </div>
            </div>
            <button 
              className="alert-action-btn"
              onClick={() => setSubscribeModalOpen(true)}
            >
              Manage Alert Recipients
            </button>
          </div>
        )}

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
                    <div className="curve-subtitle-desc">Atmospheric rotting gas release with real-time timestamps</div>
                  </div>
                  <div className="curve-badge curve-badge-green">
                    <span className="badge-pulse-green" />
                    <span>{sensor.voc_raw.toLocaleString()} ticks</span>
                  </div>
                </div>
                <div className="chart-svg-box">
                  {renderSVGChart(vocHistory, '#10b981', 'ticks', undefined, undefined, 'voc')}
                </div>
              </div>

              {/* Thermal Abuse Timeline */}
              <div className="curve-chart-card curve-card-temp-accent">
                <div className="curve-card-top">
                  <div>
                    <div className="curve-main-title">Temperature Abuse Timeline</div>
                    <div className="curve-subtitle-desc">Continuous cold-chain thermal stability with timestamped tracking</div>
                  </div>
                  <div className="curve-badge curve-badge-red">
                    <span className="badge-pulse-red" />
                    <span>{sensor.temperature_c.toFixed(1)}°C</span>
                  </div>
                </div>
                <div className="chart-svg-box">
                  {renderSVGChart(tempHistory, '#ef4444', '°C', 15, 45, 'temp')}
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
                  <code>Risk_bio = clamp((VOC_0 - VOC_t) / &Delta;_s, 0.045, 1.0)</code>
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
                  <code>RUL = (0.85 - Risk) / (|Velocity| &middot; c)</code>
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

      {/* ================================================================ */}
      {/* AWS SNS SPOILAGE ALERTS SUBSCRIPTION MODAL (RISK >= 80%)         */}
      {/* ================================================================ */}
      {subscribeModalOpen && (
        <div className="modal-backdrop-overlay animate-fade-in" onClick={() => setSubscribeModalOpen(false)}>
          <div className="sns-modal-card animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="sns-modal-header">
              <div className="sns-modal-title-group">
                <div className="sns-modal-icon-badge">
                  <Bell size={20} color="#d97706" />
                </div>
                <div>
                  <h3 className="sns-modal-title">AWS Spoilage Alert Dispatch</h3>
                  <p className="sns-modal-subtitle">Instant automated notification whenever Spoilage Risk reaches 80%</p>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSubscribeModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="sns-modal-body">
              <div className="sns-info-callout">
                <ShieldCheck size={16} color="#059669" />
                <span>Automated dispatch system wired to <strong>AWS Cloud & Amazon SNS</strong> in <code>ap-south-1</code>.</span>
              </div>

              <div className="sns-subscribe-form">
                <label className="sns-form-label">Select Alert Channel</label>
                <div className="sns-protocol-selector-3">
                  <button
                    type="button"
                    className={`protocol-btn ${subProtocol === 'browser' ? 'active-protocol' : ''}`}
                    onClick={() => { setSubProtocol('browser'); setSubResult(null); }}
                  >
                    <Monitor size={15} />
                    <span>Browser Desktop Push</span>
                  </button>
                  <button
                    type="button"
                    className={`protocol-btn ${subProtocol === 'email' ? 'active-protocol' : ''}`}
                    onClick={() => { setSubProtocol('email'); setSubResult(null); }}
                  >
                    <Mail size={15} />
                    <span>Email (AWS SNS)</span>
                  </button>
                  <button
                    type="button"
                    className={`protocol-btn ${subProtocol === 'sms' ? 'active-protocol' : ''}`}
                    onClick={() => { setSubProtocol('sms'); setSubResult(null); }}
                  >
                    <Phone size={15} />
                    <span>SMS (AWS SNS)</span>
                  </button>
                </div>

                {/* BROWSER DESKTOP NOTIFICATION SECTION */}
                {subProtocol === 'browser' && (
                  <div className="browser-notif-box animate-fade-in" style={{ marginTop: '14px' }}>
                    <div className="browser-notif-status-row">
                      <span className="sns-form-label" style={{ margin: 0 }}>Browser Notification Status:</span>
                      <span className={`status-badge-pill ${browserNotifPermission === 'granted' ? 'badge-granted' : browserNotifPermission === 'denied' ? 'badge-denied' : 'badge-pending'}`}>
                        {browserNotifPermission === 'granted' ? '✅ Active & Allowed' : browserNotifPermission === 'denied' ? '❌ Blocked by Browser' : '⚠️ Permission Required'}
                      </span>
                    </div>

                    <p className="browser-notif-explainer">
                      Receive instant, zero-latency desktop and mobile popups directly from your operating system whenever Spoilage Risk reaches or exceeds <strong>80%</strong>. No email or phone entry required.
                    </p>

                    <div className="browser-notif-action-row">
                      {browserNotifPermission !== 'granted' ? (
                        <button
                          type="button"
                          className="btn-enable-browser-notif"
                          onClick={requestBrowserNotificationPermission}
                        >
                          <Bell size={15} />
                          <span>Enable Browser Desktop Notifications</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-test-browser-notif"
                          onClick={sendTestBrowserNotification}
                        >
                          <Bell size={15} />
                          <span>Send Test Desktop Alert</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* EMAIL OR SMS FORM SECTION */}
                {(subProtocol === 'email' || subProtocol === 'sms') && (
                  <form onSubmit={handleSubscribeSNS} className="animate-fade-in" style={{ marginTop: '14px' }}>
                    <label className="sns-form-label">
                      {subProtocol === 'email' ? 'Recipient Email Address' : 'Recipient Phone Number (with Country Code)'}
                    </label>
                    <input
                      type={subProtocol === 'email' ? 'email' : 'tel'}
                      className="sns-endpoint-input"
                      placeholder={subProtocol === 'email' ? 'e.g. manager@coldchain.com' : 'e.g. +919876543210'}
                      value={subEndpoint}
                      onChange={e => setSubEndpoint(e.target.value)}
                      required
                    />

                    <div className="sns-modal-actions">
                      <button
                        type="button"
                        className="modal-cancel-btn"
                        onClick={() => setSubscribeModalOpen(false)}
                      >
                        Close
                      </button>
                      <button
                        type="submit"
                        className="modal-submit-btn"
                        disabled={subLoading || !subEndpoint.trim()}
                      >
                        {subLoading ? 'Registering with AWS...' : 'Subscribe to AWS Alerts'}
                      </button>
                    </div>
                  </form>
                )}

                {subResult && (
                  <div className={`sns-result-banner ${subResult.success ? 'result-success' : 'result-error'}`}>
                    {subResult.success ? <CheckCircle2 size={16} color="#059669" /> : <AlertTriangle size={16} color="#dc2626" />}
                    <span>{subResult.message}</span>
                  </div>
                )}

                {subProtocol === 'browser' && (
                  <div className="sns-modal-actions" style={{ marginTop: '18px' }}>
                    <button
                      type="button"
                      className="modal-cancel-btn"
                      onClick={() => setSubscribeModalOpen(false)}
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
