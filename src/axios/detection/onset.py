from enum import Enum
from typing import Dict
from datetime import datetime
from axios.contracts.processed import ProcessedReading

class SpoilageState(Enum):
    STABLE = "STABLE"
    WATCH = "WATCH"
    ONSET_CANDIDATE = "ONSET_CANDIDATE"
    SPOILAGE_ONSET = "SPOILAGE_ONSET"

class OnsetDetector:
    def __init__(self):
        self.sessions = {}
        self.risk_threshold = 0.20
        self.persistence_seconds = 120 
        self.shock_spoilage_threshold = 0.75
        self.shock_recovery_thresahold = 0.05

    def detect(self, reading: ProcessedReading, bio_risk: float) -> Dict:
        session_id = reading.raw.session_id
        current_time = datetime.fromisoformat(reading.raw.received_at.replace("Z", "+00:00"))

        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "state": SpoilageState.STABLE,
                "state_entered_at": current_time,
                "confidence": 0.0
            }
            
        state_obj = self.sessions[session_id]
        time_in_state = (current_time - state_obj["state_entered_at"]).total_seconds()
        if time_in_state <= 0: time_in_state = 65 

        if bio_risk >= self.shock_spoilage_threshold and state_obj["state"] != SpoilageState.SPOILAGE_ONSET:
            self._transition(state_obj, SpoilageState.SPOILAGE_ONSET, current_time)
            state_obj["confidence"] = 0.99
        elif bio_risk <= self.shock_recovery_thresahold and state_obj["state"] != SpoilageState.STABLE:
            self._transition(state_obj, SpoilageState.STABLE, current_time)
            state_obj["confidence"] = 0.0
        else:
            if state_obj["state"] == SpoilageState.STABLE:
                if bio_risk >= self.risk_threshold:
                    self._transition(state_obj, SpoilageState.WATCH, current_time)
                    
            elif state_obj["state"] == SpoilageState.WATCH:
                if bio_risk < self.risk_threshold:
                    self._transition(state_obj, SpoilageState.STABLE, current_time)
                elif time_in_state >= (self.persistence_seconds / 2):
                    self._transition(state_obj, SpoilageState.ONSET_CANDIDATE, current_time)
                    
            elif state_obj["state"] == SpoilageState.ONSET_CANDIDATE:
                if bio_risk < self.risk_threshold:
                    self._transition(state_obj, SpoilageState.STABLE, current_time)
                elif time_in_state >= (self.persistence_seconds / 2):
                    self._transition(state_obj, SpoilageState.SPOILAGE_ONSET, current_time)
                    state_obj["confidence"] = 0.85
                
        return {
            "onset_detected": state_obj["state"] == SpoilageState.SPOILAGE_ONSET,
            "current_state": state_obj["state"].value,
            "onset_confidence": state_obj["confidence"]
        }

    def _transition(self, state_obj, new_state, current_time):
        state_obj["state"] = new_state
        state_obj["state_entered_at"] = current_time