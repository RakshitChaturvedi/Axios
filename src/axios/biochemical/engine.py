from typing import Dict
from axios.contracts.processed import ProcessedReading

class BiochemicalEngine:
    def __init__(self):
        # Configurable weights for deterministic scoring[cite: 2]
        self.w_voc_dev = 5.0   # Weight for total VOC deviation
        self.w_nox_dev = 2.0   # Weight for NOx deviation
        self.w_voc_vel = 1.0   # Weight for degradation speed

    def calculate_risk(self, reading: ProcessedReading) -> Dict[str, float]:
        if not reading.baseline_established:
            return {
                "biochemical_risk": 0.0,
                "voc_signal": 0.0,
                "nox_signal": 0.0,
                "degradation_velocity": 0.0
            }

        # SGP41 VOC ticks drop as VOCs increase. 
        # A negative relative change means higher gas presence.
        voc_signal = max(0.0, -reading.voc_relative_change) * self.w_voc_dev
        
        # NOx ticks can fluctuate in either direction depending on the specific gas mix
        nox_signal = abs(reading.nox_relative_change) * self.w_nox_dev
        
        # Negative velocity means the VOC resistance is dropping rapidly (spoilage accelerating)
        voc_vel_risk = max(0.0, -reading.voc_velocity) * self.w_voc_vel
        degradation_velocity = voc_vel_risk 

        # Compute multi-signal biochemical score[cite: 1]
        raw_score = voc_signal + nox_signal + degradation_velocity
        
        # Clamp between 0.0 (fresh) and 1.0 (maximum risk)
        risk_score = min(1.0, max(0.0, raw_score))

        return {
            "biochemical_risk": round(risk_score, 4),
            "voc_signal": round(voc_signal, 4),
            "nox_signal": round(nox_signal, 4),
            "degradation_velocity": round(degradation_velocity, 4)
        }