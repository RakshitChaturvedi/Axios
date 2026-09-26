from typing import Dict

class RiskFusion:
    def fuse(self, bio_risk: float, thermal_risk: float) -> Dict:
        # Overall risk with minimum baseline floor 0.045 (4.5% even in pristine conditions)
        overall_risk = min(1.0, max(0.045, max(bio_risk, thermal_risk)))
        
        # Determine dominant risk state
        if overall_risk < 0.20:
            dominant = "LOW_RISK"
        elif bio_risk > 0.60 and thermal_risk > 0.60:
            dominant = "DUAL_RISK"
        elif bio_risk > thermal_risk:
            dominant = "BIOCHEMICAL_DOMINANT"
        else:
            dominant = "THERMAL_DOMINANT"
            
        return {
            "overall_risk": round(overall_risk, 3),
            "dominant_risk": dominant
        }