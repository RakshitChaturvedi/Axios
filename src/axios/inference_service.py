import os
import json
import time
import boto3
from datetime import datetime
from dotenv import load_dotenv

from axios.ingestion.processor import IngestionProcessor
from axios.processing.signal_processor import SignalProcessor
from axios.biochemical.engine import BiochemicalEngine
from axios.thermal.engine import ThermalEngine
from axios.detection.onset import OnsetDetector
from axios.rul.estimator import RULEstimator
from axios.fusion.risk import RiskFusion
from axios.evidence.events import EvidenceEngine
from axios.persistence.db import SessionLocal, init_db
from axios.persistence.models import SessionModel, RawTelemetryModel, EventModel, StateSnapshotModel

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")
QUEUE_URL = os.getenv("AWS_SQS_QUEUE_URL")
SNS_TOPIC_ARN = os.getenv("AWS_SNS_TOPIC_ARN")

class InferenceEngineService:
    def __init__(self):
        init_db()
        self.ingestor = IngestionProcessor(raw_storage_dir="data/raw")
        self.signal_engine = SignalProcessor(baseline_window=5)
        self.bio_engine = BiochemicalEngine()
        self.thermal_engine = ThermalEngine()
        self.onset_detector = OnsetDetector()
        self.rul_estimator = RULEstimator()
        self.risk_fusion = RiskFusion()
        self.evidence_engine = EvidenceEngine()

        self.sqs = boto3.client("sqs", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION) if QUEUE_URL else None
        self.sns = boto3.client("sns", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION) if SNS_TOPIC_ARN else None
        
        self.last_known_state = {}
        self.last_alert_timestamps = {}
        print("[InferenceService] Initialized and connected to AWS SQS & SNS.")

    def process_telemetry_payload(self, payload: dict) -> dict:
        """Runs the entire 7-phase Axios pipeline on a raw sensor payload."""
        raw = self.ingestor.process(payload)
        if not raw:
            return None

        # 1. Signal Processing
        processed = self.signal_engine.process(raw)

        # 2. Risk Engines
        bio = self.bio_engine.calculate_risk(processed)
        thermal = self.thermal_engine.calculate_risk(processed)
        fusion = self.risk_fusion.fuse(bio["biochemical_risk"], thermal["thermal_risk"])

        # 3. State Machine & RUL
        onset = self.onset_detector.detect(processed, bio["biochemical_risk"])
        rul = self.rul_estimator.estimate(bio["biochemical_risk"], bio["degradation_velocity"])

        # 4. Evidence Events
        events = self.evidence_engine.evaluate(raw.session_id, raw.received_at, processed, bio, onset)

        result = {
            "device_id": raw.device_id,
            "session_id": raw.session_id,
            "timestamp": raw.received_at,
            "food_type": raw.food_type,
            "state": onset["current_state"],
            "overall_risk": fusion["overall_risk"],
            "dominant_risk": fusion["dominant_risk"],
            "biochemical_risk": bio["biochemical_risk"],
            "thermal_risk": thermal["thermal_risk"],
            "rul_hours": rul["remaining_useful_life_hours"],
            "rul_lower": rul["lower_bound_hours"],
            "rul_upper": rul["upper_bound_hours"],
            "temperature_c": raw.temperature_c,
            "humidity_pct": raw.humidity_pct,
            "voc_raw": raw.voc_raw,
            "nox_raw": raw.nox_raw,
            "events": events
        }

        # 5. Persist to RDS Database (Hot State & Evidence Ledger)
        self._persist_to_db(raw, result, events)

        # 6. Publish threshold alerts to SNS if Risk >= 80% or SPOILAGE_ONSET detected
        if fusion["overall_risk"] >= 0.80 or onset["current_state"] == "SPOILAGE_ONSET":
            self._publish_sns_alert(result)

        self.last_known_state[raw.device_id] = result
        return result

    def _persist_to_db(self, raw, state, events):
        try:
            db = SessionLocal()
            # Session check
            existing_session = db.query(SessionModel).filter_by(session_id=raw.session_id).first()
            if not existing_session:
                new_session = SessionModel(
                    session_id=raw.session_id,
                    device_id=raw.device_id,
                    food_type=raw.food_type,
                    status="ACTIVE",
                    started_at=raw.received_at
                )
                db.add(new_session)

            # Raw Telemetry
            telemetry_row = RawTelemetryModel(
                session_id=raw.session_id,
                received_at=raw.received_at,
                temperature_c=raw.temperature_c,
                humidity_pct=raw.humidity_pct,
                voc_raw=raw.voc_raw,
                nox_raw=raw.nox_raw
            )
            db.add(telemetry_row)

            # State Snapshot
            snapshot_row = StateSnapshotModel(
                session_id=raw.session_id,
                timestamp=raw.received_at,
                spoilage_state=state["state"],
                overall_risk=state["overall_risk"],
                rul_hours=state["rul_hours"]
            )
            db.add(snapshot_row)

            # Evidence Ledger
            for ev in events:
                event_row = EventModel(
                    session_id=ev["session_id"],
                    event=ev["event"],
                    timestamp=ev["timestamp"],
                    severity=ev["severity"],
                    evidence=ev["evidence"]
                )
                db.add(event_row)

            db.commit()
            db.close()
        except Exception as e:
            print(f"[DB ERROR] Failed to persist snapshot/event: {e}")

    def _publish_sns_alert(self, state):
        if not self.sns or not SNS_TOPIC_ARN:
            return
        device_id = state.get("device_id", "default")
        now_ts = time.time()
        last_alert = self.last_alert_timestamps.get(device_id, 0)
        # Cooldown: 120 seconds between alerts per device to prevent flooding
        if now_ts - last_alert < 120:
            return
        self.last_alert_timestamps[device_id] = now_ts
        try:
            risk_pct = round(state["overall_risk"] * 100, 1)
            message = {
                "alert": "AWS_SPOILAGE_RISK_THRESHOLD_EXCEEDED",
                "device_id": state["device_id"],
                "food_type": state["food_type"],
                "timestamp": state["timestamp"],
                "overall_risk_percent": f"{risk_pct}%",
                "dominant_risk": state.get("dominant_risk", "BIOCHEMICAL_DOMINANT"),
                "state": state.get("state", "SPOILAGE_ONSET"),
                "remaining_useful_life_hours": f"{state.get('rul_hours', 0.0)}h",
                "sensor_telemetry": {
                    "voc_raw_ticks": state.get("voc_raw"),
                    "temperature_c": state.get("temperature_c"),
                    "humidity_pct": state.get("humidity_pct")
                },
                "recommended_action": f"CRITICAL: Spoilage risk reached {risk_pct}% (>= 80% threshold). Immediate refrigeration or disposal required."
            }
            self.sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject=f"🚨 ALERT: FreshTrace High Spoilage Risk ({risk_pct}%) on {state['device_id']}",
                Message=json.dumps(message, indent=2)
            )
            print(f"[SNS ALERT SENT] Spoilage risk ({risk_pct}%) published to AWS SNS: {SNS_TOPIC_ARN}")
        except Exception as e:
            print(f"[SNS ERROR] Failed to publish alert: {e}")

    def run_stream_listener(self, poll_interval_seconds: int = 1):
        """Continuously polls AWS SQS for sensor messages delivered by IoT Core."""
        if not self.sqs or not QUEUE_URL:
            print("[ERROR] SQS Queue URL not configured.")
            return

        print(f"[*] Axios Stream Consumer listening on: {QUEUE_URL}")
        while True:
            try:
                response = self.sqs.receive_message(
                    QueueUrl=QUEUE_URL,
                    MaxNumberOfMessages=5,
                    WaitTimeSeconds=10,
                    VisibilityTimeout=30
                )
                messages = response.get("Messages", [])
                for msg in messages:
                    body = json.loads(msg["Body"])
                    receipt_handle = msg["ReceiptHandle"]

                    # Process the telemetry payload
                    result = self.process_telemetry_payload(body)
                    if result:
                        print(f"[{result['device_id']}] Processed: State={result['state']} | Risk={result['overall_risk']:.3f} ({result['dominant_risk']}) | RUL={result['rul_hours']}h")

                    # Delete message from SQS upon successful processing
                    self.sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=receipt_handle)

                if not messages:
                    time.sleep(poll_interval_seconds)

            except Exception as e:
                print(f"[STREAM ERROR] {e}")
                time.sleep(2)

if __name__ == "__main__":
    service = InferenceEngineService()
    service.run_stream_listener()
