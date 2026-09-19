from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BaselineStatistics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    established_at: datetime

    sample_count: int

    voc_mean: float
    voc_std: float

    nox_mean: float
    nox_std: float

    temperature_mean: float
    temperature_std: float

    humidity_mean: float
    humidity_std: float