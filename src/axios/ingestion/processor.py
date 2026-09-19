import json
import os
from datetime import datetime
from pathlib import Path
from axios.contracts.telemetry import RawTelemetry

class IngestionProcessor:
    def __init__(self, raw_storage_dir: str = "data/raw"):
        self.raw_storage_dir = Path(raw_storage_dir)
        self.raw_storage_dir.mkdir(parents=True, exist_ok=True)
        self.sequence_trackers = {} # device_id -> expected sequence
        self.active_sessions = {}   # device_id -> session_id

    def validate_payload(self, payload: dict) -> RawTelemetry:
        """Validates ranges and types, returning a structured contract."""
        try:
            # 1. Type and presence validation
            telemetry = RawTelemetry(
                device_id=str(payload["device_id"]),
                food_type=str(payload.get("food_type", "unknown")),
                temperature_c=float(payload["temperature_c"]),
                humidity_pct=float(payload["humidity_pct"]),
                pressure_hpa=float(payload.get("pressure_hpa", 1013.25)),
                voc_raw=int(payload["voc_raw"]),
                nox_raw=int(payload["nox_raw"]),
                voc_index=int(payload.get("voc_index", 0)),
                nox_index=int(payload.get("nox_index", 0)),
                wifi_rssi=int(payload.get("wifi_rssi", 0)),
                sequence_number=payload.get("sequence_number")
            )

            # 2. Range validation
            if not (-40 <= telemetry.temperature_c <= 85):
                raise ValueError(f"Temperature {telemetry.temperature_c} out of bounds")
            if not (0 <= telemetry.humidity_pct <= 100):
                raise ValueError(f"Humidity {telemetry.humidity_pct} out of bounds")
            if telemetry.voc_raw < 0 or telemetry.nox_raw < 0:
                raise ValueError("VOC/NOx raw values cannot be negative")

            return telemetry
        except (KeyError, ValueError, TypeError) as e:
            raise ValueError(f"Validation failed: {str(e)}")

    def process(self, payload: dict):
        """Main ingestion pipeline."""
        try:
            telemetry = self.validate_payload(payload)
        except ValueError as e:
            print(f"[REJECTED] {e}")
            return None

        device = telemetry.device_id
        
        # Session assignment (Simplification: 1 session per device for now)
        if device not in self.active_sessions:
            self.active_sessions[device] = f"session_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        telemetry.session_id = self.active_sessions[device]
        telemetry.received_at = datetime.utcnow().isoformat() + "Z"

        # Gap and duplicate detection
        seq = telemetry.sequence_number
        if seq is not None:
            expected_seq = self.sequence_trackers.get(device)
            if expected_seq is not None:
                if seq == expected_seq - 1:
                    print(f"[WARN] Duplicate sequence {seq} detected for {device}")
                elif seq < expected_seq - 1:
                    print(f"[WARN] Out-of-order sequence {seq} detected for {device}")
                elif seq > expected_seq:
                    print(f"[WARN] GAP DETECTED: expected {expected_seq}, got {seq}")
            self.sequence_trackers[device] = seq + 1

        # Raw local storage
        self._store_raw(telemetry)
        return telemetry

    def _store_raw(self, telemetry: RawTelemetry):
        device_dir = self.raw_storage_dir / telemetry.device_id
        device_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = device_dir / f"{telemetry.session_id}.jsonl"
        with open(file_path, "a") as f:
            # Convert dataclass to dict and write out
            f.write(json.dumps(telemetry.__dict__) + "\n")