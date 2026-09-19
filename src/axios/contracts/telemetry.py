from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RawTelemetry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Device-provided fields
    device_id: str
    food_type: str

    temperature_c: float
    humidity_pct: float
    pressure_hpa: float

    voc_raw: float
    nox_raw: float

    voc_index: float | None = None
    nox_index: float | None = None

    wifi_rssi: int | None = None
    session_id: Optional[str] = None
    received_at: Optional[str] = None
    sequence_number: int | None = Field(default=None, ge=0)