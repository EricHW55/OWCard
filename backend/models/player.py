# models/player.py
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    nickname = Column(String(50), nullable=False, index=True)

    # 추가
    selected_deck_id = Column(Integer, ForeignKey("decks.id"), nullable=True)

    decks = relationship("Deck", foreign_keys="Deck.player_id")