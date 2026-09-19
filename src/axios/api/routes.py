from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import json

app = FastAPI(title="Axios API")

# In a real setup, these would query the SQLAlchemy models above.
# For the hackathon demo, we will mock the primary state object response.

@app.get("/devices")
def get_devices():
    return {"devices": ["FreshTrace-Node-01"]}

@app.get("/devices/{device_id}/status")
def get_device_status(device_id: str):
    """Returns the primary state object for the dashboard[cite: 1, 2]."""
    if device_id != "FreshTrace-Node-01":
        raise HTTPException(status_code=404, detail="Device not found")
        
    return {
        "device_id": device_id,
        "food_type": "tomato",
        "state": "WATCH",
        "spoilage_risk": 0.230,
        "spoilage_onset": {
            "detected": False,
            "timestamp": None,
            "confidence": 0.0
        },
        "remaining_useful_life": {
            "hours": 72.0,
            "lower": 61.2,
            "upper": 72.0
        },
        "degradation_velocity": 0.0,
        "risk": {
            "thermal": 0.0,
            "biochemical": 0.230,
            "dominant": "biochemical"
        }
    }

@app.get("/devices/{device_id}/events")
def get_device_events(device_id: str):
    return [
        {
            "event": "BASELINE_ESTABLISHED",
            "timestamp": "2026-09-19T15:48:04Z",
            "severity": 0.0,
            "evidence": {}
        },
        {
            "event": "STATE_TRANSITION_WATCH",
            "timestamp": "2026-09-19T15:48:04Z",
            "severity": 0.2299,
            "evidence": {"voc_signal": 0.23, "degradation_velocity": 0.0}
        }
    ]

# Start the server (run this file directly or use uvicorn)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)