from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RiskState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    timestamp: datetime

    biochemical_risk: float | None = None
    thermal_risk: float | None = None
    overall_risk: float | None = None

    dominant_risk: str | None = None
    state: str

    rul_hours: float | None = None
    rul_lower_hours: float | None = None
    rul_upper_hours: float | None = None

    data_quality: str