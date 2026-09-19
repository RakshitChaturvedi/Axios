import argparse
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))
from axios.ingestion.processor import IngestionProcessor
from axios.processing.signal_processor import SignalProcessor
from axios.biochemical.engine import BiochemicalEngine
from axios.thermal.engine import ThermalEngine
from axios.detection.onset import OnsetDetector
from axios.rul.estimator import RULEstimator
from axios.fusion.risk import RiskFusion
from axios.evidence.events import EvidenceEngine

def run_replay(input_file: str):
    path = Path(input_file)
    if not path.exists(): sys.exit(1)
    
    print(f"--- Starting Axios Pipeline Replay ---")
    
    ingestor = IngestionProcessor(raw_storage_dir="data/raw")
    signal_engine = SignalProcessor()
    bio_engine = BiochemicalEngine()
    thermal_engine = ThermalEngine()
    onset_detector = OnsetDetector() 
    rul_estimator = RULEstimator()
    risk_fusion = RiskFusion()
    evidence_engine = EvidenceEngine()
    
    with open(path, 'r') as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip(): continue   
            try:
                payload = json.loads(line)
                payload["sequence_number"] = line_no
                
                raw = ingestor.process(payload)
                if not raw: continue
                
                processed = signal_engine.process(raw)
                bio = bio_engine.calculate_risk(processed)
                thermal = thermal_engine.calculate_risk(processed)  
                onset = onset_detector.detect(processed, bio['biochemical_risk'])
                rul = rul_estimator.estimate(bio['biochemical_risk'], bio['degradation_velocity'])
                fusion = risk_fusion.fuse(bio['biochemical_risk'], thermal['thermal_risk'])
                events = evidence_engine.evaluate(raw.session_id, raw.received_at, processed, bio, onset)

                print(f"[{line_no}] Overall Risk: {fusion['overall_risk']:.3f} "
                      f"({fusion['dominant_risk']}) | State: {onset['current_state']}")
                for ev in events:
                    print(f"  >>> AUDIT EVENT: {ev['event']} at {ev['timestamp']} (Severity: {ev['severity']})")
                      
            except json.JSONDecodeError:
                pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()
    run_replay(args.input)