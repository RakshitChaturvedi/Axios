from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class EvidenceEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    session_id: str

    timestamp: datetime

    event_type: str
    severity: float | None = None

    evidence: dict[str, Any]

    supersedes_event_id: str | None = None