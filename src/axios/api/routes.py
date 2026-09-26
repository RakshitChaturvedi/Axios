import json
import asyncio
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from axios.persistence.db import SessionLocal, get_db, init_db
from axios.persistence.models import SessionModel, RawTelemetryModel, EventModel, StateSnapshotModel
from axios.inference_service import InferenceEngineService

app = FastAPI(title="Axios Biochemical Spoilage Intelligence API", version="0.2.0")

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global inference engine instance
inference_engine = InferenceEngineService()

# Global list of connected stream subscribers for live push
subscribers: List[asyncio.Queue] = []

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat() + "Z"}

@app.get("/devices")
def get_devices(db: Session = Depends(get_db)):
    sessions = db.query(SessionModel).all()
    devices = list(set([s.device_id for s in sessions]))
    if not devices:
        devices = ["FreshTrace-Node-01"]
    return {"devices": devices}

def check_device_online(ts_val) -> tuple[bool, float]:
    """Calculates whether the hardware node is actively streaming or powered off."""
    if not ts_val:
        return False, 999999.0
    try:
        if isinstance(ts_val, str):
            clean_ts = ts_val.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_ts)
        elif isinstance(ts_val, datetime):
            dt = ts_val
        else:
            return False, 999999.0

        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.utcnow()
        elapsed = (now - dt).total_seconds()
        # ESP32 publishes every 1-2 seconds. If no packet in >15s, sensor is considered OFFLINE / DISCONNECTED
        is_online = elapsed <= 15.0
        return is_online, max(0.0, elapsed)
    except Exception:
        return False, 999999.0

@app.get("/devices/{device_id}/status")
def get_device_status(device_id: str, db: Session = Depends(get_db)):
    """Returns the primary real-time state object for the dashboard with online/offline detection."""
    # Check in-memory active state first
    if device_id in inference_engine.last_known_state:
        state = inference_engine.last_known_state[device_id]
        ts = state.get("timestamp")
        is_online, elapsed = check_device_online(ts)
        return {
            "device_id": device_id,
            "is_online": is_online,
            "connection_state": "ONLINE_STREAMING" if is_online else "OFFLINE_STANDBY",
            "seconds_since_last_packet": round(elapsed, 1),
            "food_type": state["food_type"],
            "state": state["state"],
            "spoilage_risk": state["overall_risk"],
            "dominant_risk": state["dominant_risk"],
            "risk": {
                "biochemical": state["biochemical_risk"],
                "thermal": state["thermal_risk"],
                "overall": state["overall_risk"],
                "dominant": state["dominant_risk"]
            },
            "remaining_useful_life": {
                "hours": state["rul_hours"],
                "lower": state["rul_lower"],
                "upper": state["rul_upper"]
            },
            "sensor": {
                "temperature_c": state["temperature_c"],
                "humidity_pct": state["humidity_pct"],
                "voc_raw": state["voc_raw"],
                "nox_raw": state["nox_raw"]
            },
            "last_updated": ts
        }

    # Otherwise query the latest snapshot from DB
    session_record = db.query(SessionModel).filter_by(device_id=device_id).order_by(SessionModel.started_at.desc()).first()
    if not session_record:
        # Default empty state for known device with 4.5% minimum floor
        return {
            "device_id": device_id,
            "is_online": False,
            "connection_state": "OFFLINE_STANDBY",
            "seconds_since_last_packet": 999999.0,
            "food_type": "tomato",
            "state": "STABLE",
            "spoilage_risk": 0.045,
            "dominant_risk": "LOW_RISK",
            "risk": {"biochemical": 0.045, "thermal": 0.0, "overall": 0.045, "dominant": "LOW_RISK"},
            "remaining_useful_life": {"hours": 72.0, "lower": 61.2, "upper": 72.0},
            "sensor": {"temperature_c": 29.69, "humidity_pct": 68.04, "voc_raw": 31521, "nox_raw": 16769},
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }

    latest_snapshot = db.query(StateSnapshotModel).filter_by(session_id=session_record.session_id).order_by(StateSnapshotModel.id.desc()).first()
    latest_telemetry = db.query(RawTelemetryModel).filter_by(session_id=session_record.session_id).order_by(RawTelemetryModel.id.desc()).first()

    ts = latest_snapshot.timestamp if latest_snapshot else (latest_telemetry.timestamp if latest_telemetry else None)
    is_online, elapsed = check_device_online(ts)
    calc_risk = max(0.045, latest_snapshot.overall_risk) if latest_snapshot else 0.045

    return {
        "device_id": device_id,
        "is_online": is_online,
        "connection_state": "ONLINE_STREAMING" if is_online else "OFFLINE_STANDBY",
        "seconds_since_last_packet": round(elapsed, 1),
        "food_type": session_record.food_type,
        "state": latest_snapshot.spoilage_state if latest_snapshot else "STABLE",
        "spoilage_risk": round(calc_risk, 3),
        "dominant_risk": "BIOCHEMICAL_DOMINANT" if (calc_risk > 0.3) else "LOW_RISK",
        "risk": {
            "biochemical": round(calc_risk, 3),
            "thermal": 0.0,
            "overall": round(calc_risk, 3),
            "dominant": "BIOCHEMICAL_DOMINANT" if (calc_risk > 0.3) else "LOW_RISK"
        },
        "remaining_useful_life": {
            "hours": latest_snapshot.rul_hours if latest_snapshot else 72.0,
            "lower": max(0.0, (latest_snapshot.rul_hours * 0.85)) if latest_snapshot else 61.2,
            "upper": min(72.0, (latest_snapshot.rul_hours * 1.15)) if latest_snapshot else 72.0
        },
        "sensor": {
            "temperature_c": latest_telemetry.temperature_c if latest_telemetry else 0.0,
            "humidity_pct": latest_telemetry.humidity_pct if latest_telemetry else 0.0,
            "voc_raw": latest_telemetry.voc_raw if latest_telemetry else 0,
            "nox_raw": latest_telemetry.nox_raw if latest_telemetry else 0
        },
        "last_updated": ts if ts else datetime.utcnow().isoformat() + "Z"
    }

class SubscriptionPayload(BaseModel):
    protocol: str = "email" # "email" or "sms"
    endpoint: str          # Email address or phone number in E.164 format

@app.post("/notifications/subscribe")
def subscribe_sns_alerts(payload: SubscriptionPayload):
    """Subscribes an email or phone number to the AWS SNS AxiosSpoilageAlerts topic."""
    import os, boto3
    topic_arn = os.getenv("AWS_SNS_TOPIC_ARN")
    if not topic_arn:
        raise HTTPException(status_code=500, detail="AWS SNS Topic not configured.")
    try:
        sns = boto3.client(
            "sns",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "ap-south-1")
        )
        res = sns.subscribe(
            TopicArn=topic_arn,
            Protocol=payload.protocol.lower(),
            Endpoint=payload.endpoint.strip()
        )
        sub_arn = res.get("SubscriptionArn", "pending confirmation")
        return {
            "status": "success",
            "subscription_arn": sub_arn,
            "message": f"Successfully registered {payload.endpoint} with AWS SNS Spoilage Alerts. A confirmation message has been dispatched via AWS."
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"AWS SNS Subscription error: {str(e)}")

class AlertPublishPayload(BaseModel):
    device_id: str = "FreshTrace-Node-01"
    risk_score: float = 0.97
    reason: Optional[str] = "Critical Spoilage Alert"

@app.post("/notifications/publish-alert")
def trigger_alert_publish(payload: AlertPublishPayload):
    """Manually or programmatically triggers an immediate AWS SNS Spoilage Alert."""
    import os, boto3, json
    topic_arn = os.getenv("AWS_SNS_TOPIC_ARN")
    if not topic_arn:
        raise HTTPException(status_code=500, detail="AWS SNS Topic not configured.")
    try:
        sns = boto3.client(
            "sns",
            aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=os.getenv("AWS_REGION", "ap-south-1")
        )
        risk_pct = round(payload.risk_score * 100, 1)
        msg_body = {
            "alert": "CRITICAL_SPOILAGE_RISK_THRESHOLD_EXCEEDED",
            "device_id": payload.device_id,
            "risk_percentage": f"{risk_pct}%",
            "status": "SPOILAGE_ONSET",
            "message": f"🚨 EMERGENCY: Spoilage risk reached {risk_pct}%! Produce has exceeded safe consumption limits.",
            "action_required": "Inspect refrigeration unit and isolate spoiled inventory immediately."
        }
        res = sns.publish(
            TopicArn=topic_arn,
            Subject=f"🚨 ALERT: FreshTrace Critical Spoilage Risk ({risk_pct}%) on {payload.device_id}",
            Message=json.dumps(msg_body, indent=2)
        )
        return {"status": "success", "message_id": res.get("MessageId")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to publish SNS alert: {str(e)}")

@app.get("/devices/{device_id}/events")
def get_device_events(device_id: str, db: Session = Depends(get_db)):
    """Returns the immutable evidence ledger of baseline & state transitions."""
    session_record = db.query(SessionModel).filter_by(device_id=device_id).order_by(SessionModel.started_at.desc()).first()
    if not session_record:
        return []

    events = db.query(EventModel).filter_by(session_id=session_record.session_id).order_by(EventModel.id.asc()).all()
    return [
        {
            "id": e.id,
            "event": e.event,
            "timestamp": e.timestamp,
            "severity": e.severity,
            "evidence": e.evidence
        }
        for e in events
    ]

@app.get("/devices/{device_id}/telemetry/history")
def get_device_telemetry_history(device_id: str, limit: int = 60, db: Session = Depends(get_db)):
    """Returns the recent sensor curves for time-series charts."""
    session_record = db.query(SessionModel).filter_by(device_id=device_id).order_by(SessionModel.started_at.desc()).first()
    if not session_record:
        return []

    readings = db.query(RawTelemetryModel).filter_by(session_id=session_record.session_id).order_by(RawTelemetryModel.id.desc()).limit(limit).all()
    readings.reverse()

    return [
        {
            "received_at": r.received_at,
            "temperature_c": r.temperature_c,
            "humidity_pct": r.humidity_pct,
            "voc_raw": r.voc_raw,
            "nox_raw": r.nox_raw
        }
        for r in readings
    ]

class IngestPayload(BaseModel):
    device_id: str
    food_type: str = "paneer"
    temperature_c: float
    humidity_pct: float
    voc_raw: int
    nox_raw: int = 0
    voc_index: Optional[int] = 0
    nox_index: Optional[int] = 0
    pressure_hpa: Optional[float] = 1013.25
    wifi_rssi: Optional[int] = -40
    sequence_number: Optional[int] = None

@app.post("/telemetry")
async def ingest_telemetry(payload: IngestPayload):
    """Direct ingestion endpoint to run inference and broadcast to live subscribers."""
    result = inference_engine.process_telemetry_payload(payload.model_dump())
    if not result:
        raise HTTPException(status_code=400, detail="Payload validation failed")

    # Broadcast to all live SSE subscribers
    dead_subscribers = []
    for queue in subscribers:
        try:
            await queue.put(result)
        except Exception:
            dead_subscribers.append(queue)
    for q in dead_subscribers:
        subscribers.remove(q)

    return {"status": "processed", "result": result}

@app.get("/stream/devices/{device_id}")
async def stream_device_updates(device_id: str):
    """Server-Sent Events (SSE) stream for instant sub-second frontend updates."""
    queue = asyncio.Queue()
    subscribers.append(queue)

    async def event_generator():
        try:
            while True:
                data = await queue.get()
                if data.get("device_id") == device_id:
                    yield f"data: {json.dumps(data)}\n\n"
        except asyncio.CancelledError:
            subscribers.remove(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount frontend build if present
from fastapi.staticfiles import StaticFiles
import os

candidates = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "frontend", "dist"),
    os.path.join(os.getcwd(), "frontend", "dist"),
    "/opt/axios/frontend/dist"
]
for c in candidates:
    if os.path.exists(c) and os.path.exists(os.path.join(c, "index.html")):
        app.mount("/", StaticFiles(directory=c, html=True), name="frontend")
        break

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)