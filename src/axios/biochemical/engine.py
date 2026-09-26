from typing import Dict
from axios.contracts.processed import ProcessedReading

class BiochemicalEngine:
    def __init__(self):
        # Calibrated weights for SGP41 produce spoilage dynamics
        # Full rot typically causes a ~15-20% drop in VOC resistance (delta_voc >= 0.15 -> risk >= 90%)
        self.w_voc_dev = 6.0    # Scale factor for VOC relative resistance drop
        self.w_nox_dev = 0.5    # Scale factor for NOx secondary deviation
        self.w_voc_vel = 0.05   # Scale factor for hourly degradation velocity trend

    def calculate_risk(self, reading: ProcessedReading) -> Dict[str, float]:
        if not reading.baseline_established:
            return {
                "biochemical_risk": 0.0,
                "voc_signal": 0.0,
                "nox_signal": 0.0,
                "degradation_velocity": 0.0
            }

        # SGP41 VOC ticks drop as reducing VOC gases increase (rotting)
        # reading.voc_relative_change = (voc_filtered - baseline) / baseline
        # A negative relative change means higher volatile presence.
        delta_voc = max(0.0, -reading.voc_relative_change)
        voc_signal = min(1.0, delta_voc * self.w_voc_dev)
        
        # NOx ticks deviation contribution
        delta_nox = abs(reading.nox_relative_change)
        nox_signal = min(0.2, delta_nox * self.w_nox_dev)
        
        # Negative velocity means the VOC resistance is actively dropping (spoilage accelerating)
        # reading.voc_velocity is in raw ticks/second. Normalize by baseline to obtain fractional change per second.
        baseline = reading.raw.voc_raw if (reading.raw and reading.raw.voc_raw > 1000) else 31800.0
        frac_vel_sec = max(0.0, -reading.voc_velocity) / baseline
        frac_vel_hour = frac_vel_sec * 3600.0

        # Velocity provides trend acceleration (capped at 10% to prevent instantaneous noise saturation)
        voc_vel_risk = min(0.10, frac_vel_hour * self.w_voc_vel)
        degradation_velocity = frac_vel_sec

        # Compute multi-signal biochemical score
        raw_score = voc_signal + nox_signal + voc_vel_risk
        
        # Clamp between minimum baseline floor of 0.045 (4.5% inherent biological baseline) and 1.0 (maximum risk)
        risk_score = min(1.0, max(0.045, raw_score))

        return {
            "biochemical_risk": round(risk_score, 4),
            "voc_signal": round(voc_signal, 4),
            "nox_signal": round(nox_signal, 4),
            "degradation_velocity": round(degradation_velocity, 6)
        }