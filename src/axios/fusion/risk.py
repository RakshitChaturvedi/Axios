from typing import Dict

class RiskFusion:
    def fuse(self, bio_risk: float, thermal_risk: float) -> Dict:
        # Conservative approach: overall risk is the maximum of the two
        overall_risk = max(bio_risk, thermal_risk)
        
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