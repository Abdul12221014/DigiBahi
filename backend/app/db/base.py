from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ARM-friendly SQLite config
SQLALCHEMY_DATABASE_URL = "sqlite:///./digbahi_local.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite in uvicorn
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


