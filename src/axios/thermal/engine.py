import json
import math
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional
from axios.contracts.processed import ProcessedReading

class ThermalSession:
    def __init__(self):
        self.cumulative_exposure: float = 0.0
        self.last_time: Optional[datetime] = None
        self.max_temperature_c: float = -273.15

class ThermalEngine:
    def __init__(self, config_dir: str = "config/food_types"):
        self.config_dir = Path(config_dir)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.R = 8.314  # Ideal gas constant in J/(mol·K)
        self.sessions: Dict[str, ThermalSession] = {}
        self.configs: Dict[str, dict] = {}

    def _load_config(self, food_type: str) -> dict:
        if food_type not in self.configs:
            config_path = self.config_dir / f"{food_type.lower()}.json"
            if config_path.exists():
                with open(config_path, 'r') as f:
                    self.configs[food_type] = json.load(f)
            else:
                # Fallback defaults if file is missing
                self.configs[food_type] = {
                    "activation_energy_j_mol": 70000,
                    "reference_temperature_c": 4.0,
                    "max_thermal_exposure_hours": 100.0
                }
        return self.configs[food_type]

    def calculate_risk(self, reading: ProcessedReading) -> Dict[str, float]:
        session_id = reading.raw.session_id
        if session_id not in self.sessions:
            self.sessions[session_id] = ThermalSession()
            
        state = self.sessions[session_id]
        config = self._load_config(reading.raw.food_type)
        
        current_time = datetime.fromisoformat(reading.raw.received_at.replace("Z", "+00:00"))
        current_temp_c = reading.temperature_filtered
        
        # Track max temperature[cite: 1]
        state.max_temperature_c = max(state.max_temperature_c, current_temp_c)
        
        # Kelvin conversions
        t_kelvin = current_temp_c + 273.15
        t_ref_kelvin = config["reference_temperature_c"] + 273.15
        ea = config["activation_energy_j_mol"]
        
        # Arrhenius relative rate[cite: 1]
        # e.g., if temp is 30C and ref is 4C, this multiplier will be huge
        exponent = -(ea / self.R) * ((1.0 / t_kelvin) - (1.0 / t_ref_kelvin))
        relative_rate = math.exp(exponent)
        
        # Integrate exposure over time (trapezoidal/Riemann)[cite: 2]
        if state.last_time is not None:
            dt_hours = (current_time - state.last_time).total_seconds() / 3600.0
            if dt_hours <= 0:
                dt_hours = 0.1666  # Fallback 10 minutes for fast local script replay
                
            state.cumulative_exposure += relative_rate * dt_hours
            
        state.last_time = current_time
        
        # Calculate 0-1 risk score
        risk = state.cumulative_exposure / config["max_thermal_exposure_hours"]
        risk = min(1.0, max(0.0, risk))
        
        return {
            "thermal_risk": round(risk, 4),
            "thermal_exposure": round(state.cumulative_exposure, 4),
            "relative_rate_multiplier": round(relative_rate, 2),
            "max_temperature_c": round(state.max_temperature_c, 2)
        }