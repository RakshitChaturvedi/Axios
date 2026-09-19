import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from axios.persistence.models import Base
from dotenv import load_dotenv

load_dotenv()

def get_database_url() -> str:
    db_host = os.getenv("AWS_RDS_ENDPOINT")
    db_user = os.getenv("AWS_RDS_USER", "axiosadmin")
    db_pass = os.getenv("AWS_RDS_PASSWORD")
    db_name = os.getenv("AWS_RDS_DBNAME", "axios")
    db_port = os.getenv("AWS_RDS_PORT", "5432")

    if db_host and db_pass:
        return f"postgresql+psycopg2://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"
    
    # Fallback to local SQLite if RDS is not configured or offline
    return "sqlite:///axios_local.db"

DATABASE_URL = get_database_url()

try:
    engine = create_engine(DATABASE_URL, echo=False)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print(f"[WARN] Failed to initialize DB engine with {DATABASE_URL}: {e}. Falling back to SQLite.")
    engine = create_engine("sqlite:///axios_local.db", echo=False)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Initializes all tables defined in models.py"""
    Base.metadata.create_all(bind=engine)
    print(f"[DB] Initialized schema on {engine.url}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
