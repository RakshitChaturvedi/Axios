from datetime import datetime
from axios.contracts.baseline import BaselineStatistics
from pydantic import BaseModel, ConfigDict


class Session(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    device_id: str
    food_type: str

    started_at: datetime
    ended_at: datetime | None = None

    baseline: BaselineStatistics | None = None

    status: str