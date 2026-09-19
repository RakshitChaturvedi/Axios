from pydantic import BaseModel
from typing import Optional
from .telemetry import RawTelemetry  # Adjust relative import if needed

class ProcessedReading(BaseModel):
    raw: RawTelemetry
    
    # Filtered values
    voc_filtered: float
    nox_filtered: float
    temperature_filtered: float
    
    # Derivatives
    voc_velocity: float
    nox_velocity: float
    voc_acceleration: float
    nox_acceleration: float
    
    # Relative Deviation (Baseline comparison)
    voc_relative_change: float
    nox_relative_change: float
    
    # Status
    baseline_established: bool