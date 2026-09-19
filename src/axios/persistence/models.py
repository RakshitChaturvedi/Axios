from sqlalchemy import Column, Integer, String, Float, Boolean, JSON
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class SessionModel(Base):
    __tablename__ = 'sessions'
    session_id = Column(String, primary_key=True)
    device_id = Column(String, index=True)
    food_type = Column(String)
    status = Column(String, default="ACTIVE")
    started_at = Column(String)

class RawTelemetryModel(Base):
    __tablename__ = 'raw_telemetry'
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, index=True)
    received_at = Column(String)
    temperature_c = Column(Float)
    humidity_pct = Column(Float)
    voc_raw = Column(Integer)
    nox_raw = Column(Integer)

class EventModel(Base):
    __tablename__ = 'events'
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, index=True)
    event = Column(String)
    timestamp = Column(String)
    severity = Column(Float)
    evidence = Column(JSON)

class StateSnapshotModel(Base):
    __tablename__ = 'state_snapshots'
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, index=True)
    timestamp = Column(String)
    spoilage_state = Column(String)
    overall_risk = Column(Float)
    rul_hours = Column(Float)