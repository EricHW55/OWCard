"""Player / User model."""
from sqlalchemy import Column, Integer, String, DateTime, func
from database import Base


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    nickname = Column(String(50), nullable=False)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses
        return round(self.wins / total * 100, 1) if total > 0 else 0.0
