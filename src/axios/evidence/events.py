from typing import Dict, Optional

class EvidenceEngine:
    def __init__(self):
        self.last_onset_states = {}
        self.baseline_tracked = set()

    def evaluate(self, session_id: str, timestamp: str, processed_reading, bio_state, onset_state) -> Optional[Dict]:
        events = []
        
        # Track Baseline Establishment[cite: 1, 2]
        if processed_reading.baseline_established and session_id not in self.baseline_tracked:
            events.append(self._create_event("BASELINE_ESTABLISHED", session_id, timestamp, 0.0, {}))
            self.baseline_tracked.add(session_id)

        # Track Onset State Changes (STABLE -> WATCH -> ONSET)[cite: 1, 2]
        current_onset = onset_state["current_state"]
        prev_onset = self.last_onset_states.get(session_id, "STABLE")
        
        if current_onset != prev_onset:
            evidence = {
                "voc_signal": bio_state["voc_signal"],
                "degradation_velocity": bio_state["degradation_velocity"]
            }
            events.append(self._create_event(f"STATE_TRANSITION_{current_onset}", session_id, timestamp, bio_state["biochemical_risk"], evidence))
            self.last_onset_states[session_id] = current_onset
            
        return events

    def _create_event(self, event_name: str, session_id: str, timestamp: str, severity: float, evidence: dict) -> Dict:
        return {
            "event": event_name,
            "session_id": session_id,
            "timestamp": timestamp,
            "severity": severity,
            "evidence": evidence
        }