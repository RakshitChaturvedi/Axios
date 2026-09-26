import statistics
from datetime import datetime
from collections import deque
from typing import Optional, Dict
from axios.contracts.telemetry import RawTelemetry
from axios.contracts.processed import ProcessedReading

class SessionState:
    def __init__(self, baseline_window: int = 5):
        self.baseline_window = baseline_window
        self.raw_history = []
        
        # Baselines: Default to nominal Sensirion SGP41 ambient clean air reference
        self.baseline_voc: float = 31800.0
        self.baseline_nox: float = 16800.0
        self.baseline_calibrated: bool = False
        
        # Filtering state
        self.voc_median_window = deque(maxlen=3)
        self.nox_median_window = deque(maxlen=3)
        self.last_voc_ema: Optional[float] = None
        self.last_nox_ema: Optional[float] = None
        
        # Derivative state
        self.last_time: Optional[datetime] = None
        self.last_voc_vel: float = 0.0
        self.last_nox_vel: float = 0.0

class SignalProcessor:
    def __init__(self, baseline_window: int = 5):
        self.sessions: Dict[str, SessionState] = {}
        self.ema_alpha = 0.35
        self.baseline_window = baseline_window

    def process(self, raw: RawTelemetry) -> ProcessedReading:
        if raw.session_id not in self.sessions:
            self.sessions[raw.session_id] = SessionState(baseline_window=self.baseline_window)
        
        state = self.sessions[raw.session_id]
        
        # --- 1. Baseline Dynamic Calibration & Peak Tracking ---
        if not state.baseline_calibrated:
            if len(state.raw_history) == 0:
                # Seed initial baseline immediately to eliminate startup shock
                if raw.voc_raw >= 29000 or raw.voc_raw < 1000:
                    state.baseline_voc = float(raw.voc_raw)
                if raw.nox_raw >= 14000 or raw.nox_raw < 1000:
                    state.baseline_nox = float(raw.nox_raw)

            state.raw_history.append(raw)
            if len(state.raw_history) >= state.baseline_window:
                # Filter out sharp drops (contaminants) from the baseline average
                clean_voc_samples = [r.voc_raw for r in state.raw_history if r.voc_raw >= (state.baseline_voc - 800)]
                clean_nox_samples = [r.nox_raw for r in state.raw_history if abs(r.nox_raw - state.baseline_nox) <= 1500]
                
                if clean_voc_samples:
                    avg_voc = statistics.mean(clean_voc_samples)
                    if avg_voc >= 29000 or avg_voc < 1000:
                        state.baseline_voc = avg_voc
                if clean_nox_samples:
                    avg_nox = statistics.mean(clean_nox_samples)
                    if avg_nox >= 14000 or avg_nox < 1000:
                        state.baseline_nox = avg_nox
                        
                state.baseline_calibrated = True
                print(f"[BASELINE CALIBRATED] VOC: {state.baseline_voc:.2f} | NOx: {state.baseline_nox:.2f}")
        elif raw.voc_raw > state.baseline_voc and raw.voc_raw <= 34000:
            # Asymmetric clean air peak tracking
            state.baseline_voc = 0.999 * state.baseline_voc + 0.001 * raw.voc_raw

        # --- 2. Noise Filtering (Median -> EMA) ---
        state.voc_median_window.append(raw.voc_raw)
        state.nox_median_window.append(raw.nox_raw)
        
        voc_med = statistics.median(state.voc_median_window)
        nox_med = statistics.median(state.nox_median_window)

        if state.last_voc_ema is None:
            state.last_voc_ema, state.last_nox_ema = float(voc_med), float(nox_med)
        
        prev_voc_ema = state.last_voc_ema
        prev_nox_ema = state.last_nox_ema

        voc_filtered = (self.ema_alpha * float(voc_med)) + ((1 - self.ema_alpha) * prev_voc_ema)
        nox_filtered = (self.ema_alpha * float(nox_med)) + ((1 - self.ema_alpha) * prev_nox_ema)
        
        state.last_voc_ema = voc_filtered
        state.last_nox_ema = nox_filtered

        # --- 3. Derivatives (Velocity & Acceleration) ---
        if raw.received_at:
            current_time = datetime.fromisoformat(raw.received_at.replace("Z", "+00:00"))
        else:
            current_time = datetime.utcnow()
        
        voc_vel, nox_vel = 0.0, 0.0
        voc_acc, nox_acc = 0.0, 0.0
        
        if state.last_time is not None:
            dt_seconds = (current_time - state.last_time).total_seconds()
            if dt_seconds <= 0: 
                dt_seconds = 1.0  # Fallback for rapid script replay loops
            else:
                dt_seconds = max(0.5, dt_seconds)
                
            voc_vel = (voc_filtered - prev_voc_ema) / dt_seconds
            nox_vel = (nox_filtered - prev_nox_ema) / dt_seconds
            
            voc_acc = (voc_vel - state.last_voc_vel) / dt_seconds
            nox_acc = (nox_vel - state.last_nox_vel) / dt_seconds

        state.last_time = current_time
        state.last_voc_vel = voc_vel
        state.last_nox_vel = nox_vel

        # --- 4. Relative Deviation ---
        epsilon = 1.0
        voc_dev = (voc_filtered - state.baseline_voc) / (state.baseline_voc + epsilon)
        nox_dev = (nox_filtered - state.baseline_nox) / (state.baseline_nox + epsilon)

        return ProcessedReading(
            raw=raw,
            voc_filtered=round(voc_filtered, 2),
            nox_filtered=round(nox_filtered, 2),
            temperature_filtered=raw.temperature_c,
            voc_velocity=round(voc_vel, 4),
            nox_velocity=round(nox_vel, 4),
            voc_acceleration=round(voc_acc, 4),
            nox_acceleration=round(nox_acc, 4),
            voc_relative_change=round(voc_dev, 6),
            nox_relative_change=round(nox_dev, 6),
            baseline_established=True
        )