"""Deck save / load models."""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from database import Base


class Deck(Base):
    __tablename__ = "decks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    name = Column(String(100), nullable=False, default="My Deck")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    cards = relationship(
        "DeckCard", back_populates="deck",
        lazy="selectin", cascade="all, delete-orphan",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "player_id": self.player_id,
            "name": self.name,
            "cards": [c.to_dict() for c in self.cards],
        }


class DeckCard(Base):
    __tablename__ = "deck_cards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    deck_id = Column(Integer, ForeignKey("decks.id"), nullable=False)
    card_template_id = Column(Integer, ForeignKey("card_templates.id"), nullable=False)
    quantity = Column(Integer, default=1)

    deck = relationship("Deck", back_populates="cards")

    def to_dict(self) -> dict:
        return {
            "card_template_id": self.card_template_id,
            "quantity": self.quantity,
        }
