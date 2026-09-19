import sys
from pathlib import Path

# Add src to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent / "src"))

from axios.ingestion.processor import IngestionProcessor
from axios.processing.signal_processor import SignalProcessor
from axios.biochemical.engine import BiochemicalEngine
from axios.thermal.engine import ThermalEngine
from axios.detection.onset import OnsetDetector
from axios.rul.estimator import RULEstimator
from axios.fusion.risk import RiskFusion
from axios.evidence.events import EvidenceEngine

def test_live_paneer_flow():
    ingestor = IngestionProcessor(raw_storage_dir="data/raw")
    signal_engine = SignalProcessor(baseline_window=5)
    bio_engine = BiochemicalEngine()
    thermal_engine = ThermalEngine()
    onset_detector = OnsetDetector()
    rul_estimator = RULEstimator()
    risk_fusion = RiskFusion()
    evidence_engine = EvidenceEngine()

    p_base = {
        "device_id": "FreshTrace-Node-01",
        "food_type": "paneer",
        "temperature_c": 29.69,
        "humidity_pct": 68.04,
        "pressure_hpa": 947.09,
        "voc_raw": 249,
        "nox_raw": 0,
        "voc_index": 0,
        "nox_index": 0,
        "wifi_rssi": -34
    }

    print("=== Testing Paneer Live Sensor Flow ===")
    for i in range(1, 9):
        p = dict(p_base)
        p["sequence_number"] = i
        # Simulate VOC tick drop (spoilage degradation) after sample 5
        if i > 5:
            p["voc_raw"] = 230 - (i - 5) * 15
        
        raw = ingestor.process(p)
        processed = signal_engine.process(raw)
        bio = bio_engine.calculate_risk(processed)
        thermal = thermal_engine.calculate_risk(processed)
        onset = onset_detector.detect(processed, bio["biochemical_risk"])
        rul = rul_estimator.estimate(bio["biochemical_risk"], bio["degradation_velocity"])
        fusion = risk_fusion.fuse(bio["biochemical_risk"], thermal["thermal_risk"])
        events = evidence_engine.evaluate(raw.session_id, raw.received_at, processed, bio, onset)

        print(f"Sample {i}: VOC={p['voc_raw']} | BioRisk={bio['biochemical_risk']:.3f} | ThermalRisk={thermal['thermal_risk']:.3f} | Overall={fusion['overall_risk']:.3f} ({fusion['dominant_risk']}) | State={onset['current_state']} | RUL={rul['remaining_useful_life_hours']}h")
        for ev in events:
            print(f"  >>> AUDIT EVENT: {ev['event']} at {ev['timestamp']}")

if __name__ == "__main__":
    test_live_paneer_flow()
