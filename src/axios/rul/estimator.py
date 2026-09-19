from typing import Dict

class RULEstimator:
    def __init__(self):
        self.critical_risk_threshold = 0.85
        self.max_rul_hours = 72.0

    def estimate(self, bio_risk: float, degradation_velocity_sec: float) -> Dict:
        # Convert velocity from per-second to per-hour for RUL calculation
        velocity_per_hour = degradation_velocity_sec * 3600
        
        # If already spoiled
        if bio_risk >= self.critical_risk_threshold:
            return {
                "remaining_useful_life_hours": 0.0,
                "lower_bound_hours": 0.0,
                "upper_bound_hours": 0.0,
                "endpoint": "configured risk threshold crossed"
            }

        # If stable or no degradation velocity detected
        if velocity_per_hour <= 0.001:
            return {
                "remaining_useful_life_hours": self.max_rul_hours,
                "lower_bound_hours": round(self.max_rul_hours * 0.85, 1),
                "upper_bound_hours": self.max_rul_hours, # capped
                "endpoint": "configured risk threshold"
            }

        # T_remaining = (D_critical - D(t)) / (dD/dt)[cite: 1]
        rul_hours = (self.critical_risk_threshold - bio_risk) / velocity_per_hour
        
        # Clamp to reasonable maximums
        rul_hours = min(self.max_rul_hours, max(0.0, rul_hours))
        
        # Apply uncertainty bounds (e.g., +/- 15%)[cite: 1, 2]
        lower_bound = max(0.0, rul_hours * 0.85)
        upper_bound = min(self.max_rul_hours, rul_hours * 1.15)

        return {
            "remaining_useful_life_hours": round(rul_hours, 1),
            "lower_bound_hours": round(lower_bound, 1),
            "upper_bound_hours": round(upper_bound, 1),
            "endpoint": "configured risk threshold"
        }