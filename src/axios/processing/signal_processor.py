import statistics
from datetime import datetime
from collections import deque
from typing import Optional, Dict
from axios.contracts.telemetry import RawTelemetry
from axios.contracts.processed import ProcessedReading

class SessionState:
    def __init__(self, baseline_window: int = 5):
        # We use 5 for rapid testing, production uses 60[cite: 2]
        self.baseline_window = baseline_window
        self.raw_history = []
        
        # Baselines
        self.baseline_voc: Optional[float] = 31400.0
        self.baseline_nox: Optional[float] = 20300.0
        
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
    def __init__(self):
        self.sessions: Dict[str, SessionState] = {}
        self.ema_alpha = 0.3

    def process(self, raw: RawTelemetry) -> ProcessedReading:
        if raw.session_id not in self.sessions:
            self.sessions[raw.session_id] = SessionState()
        
        state = self.sessions[raw.session_id]
        
        # --- 1. Baseline Collection ---
        if state.baseline_voc is None:
            state.raw_history.append(raw)
            if len(state.raw_history) >= state.baseline_window:
                state.baseline_voc = statistics.mean([r.voc_raw for r in state.raw_history])
                state.baseline_nox = statistics.mean([r.nox_raw for r in state.raw_history])
                print(f"[BASELINE ESTABLISHED] VOC: {state.baseline_voc:.2f} | NOx: {state.baseline_nox:.2f}")

        # --- 2. Noise Filtering (Median -> EMA)[cite: 2] ---
        state.voc_median_window.append(raw.voc_raw)
        state.nox_median_window.append(raw.nox_raw)
        
        voc_med = statistics.median(state.voc_median_window)
        nox_med = statistics.median(state.nox_median_window)

        if state.last_voc_ema is None:
            state.last_voc_ema, state.last_nox_ema = voc_med, nox_med
        
        voc_filtered = (self.ema_alpha * voc_med) + ((1 - self.ema_alpha) * state.last_voc_ema)
        nox_filtered = (self.ema_alpha * nox_med) + ((1 - self.ema_alpha) * state.last_nox_ema)
        
        state.last_voc_ema = voc_filtered
        state.last_nox_ema = nox_filtered

        # --- 3. Derivatives (Velocity & Acceleration)[cite: 1] ---
        current_time = datetime.fromisoformat(raw.received_at.replace("Z", "+00:00"))
        
        voc_vel, nox_vel = 0.0, 0.0
        voc_acc, nox_acc = 0.0, 0.0
        
        if state.last_time is not None:
            dt_seconds = (current_time - state.last_time).total_seconds()
            if dt_seconds <= 0: 
                dt_seconds = 1.0 # Fallback for rapid script replay loops
                
            voc_vel = (voc_filtered - state.last_voc_ema) / dt_seconds
            nox_vel = (nox_filtered - state.last_nox_ema) / dt_seconds
            
            voc_acc = (voc_vel - state.last_voc_vel) / dt_seconds
            nox_acc = (nox_vel - state.last_nox_vel) / dt_seconds

        state.last_time = current_time
        state.last_voc_vel = voc_vel
        state.last_nox_vel = nox_vel

        # --- 4. Relative Deviation[cite: 1] ---
        epsilon = 1.0
        voc_dev, nox_dev = 0.0, 0.0
        
        if state.baseline_voc is not None:
            voc_dev = (voc_filtered - state.baseline_voc) / (state.baseline_voc + epsilon)
            nox_dev = (nox_filtered - state.baseline_nox) / (state.baseline_nox + epsilon)

        return ProcessedReading(
            raw=raw,
            voc_filtered=voc_filtered,
            nox_filtered=nox_filtered,
            temperature_filtered=raw.temperature_c, # Skipping EMA on temp for brevity
            voc_velocity=voc_vel,
            nox_velocity=nox_vel,
            voc_acceleration=voc_acc,
            nox_acceleration=nox_acc,
            voc_relative_change=voc_dev,
            nox_relative_change=nox_dev,
            baseline_established=(state.baseline_voc is not None)
        )