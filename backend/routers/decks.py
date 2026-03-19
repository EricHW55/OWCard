"""덱 CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
from models.deck import Deck, DeckCard
from config import DECK_SIZE

router = APIRouter(prefix="/decks", tags=["decks"])


class DeckCardIn(BaseModel):
    card_template_id: int
    quantity: int = 1


class CreateDeckReq(BaseModel):
    player_id: int
    name: str = "My Deck"
    cards: list[DeckCardIn]


class UpdateDeckReq(BaseModel):
    name: str | None = None
    cards: list[DeckCardIn] | None = None


@router.post("/")
async def create_deck(req: CreateDeckReq, db: AsyncSession = Depends(get_db)):
    total = sum(c.quantity for c in req.cards)
    if total != DECK_SIZE:
        raise HTTPException(400, f"Deck must have {DECK_SIZE} cards, got {total}")
    deck = Deck(player_id=req.player_id, name=req.name)
    db.add(deck)
    await db.flush()
    for ci in req.cards:
        db.add(DeckCard(deck_id=deck.id, card_template_id=ci.card_template_id, quantity=ci.quantity))
    await db.commit()
    await db.refresh(deck)
    return deck.to_dict()


@router.get("/player/{player_id}")
async def list_decks(player_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Deck).where(Deck.player_id == player_id))
    return [d.to_dict() for d in result.scalars().all()]


@router.get("/{deck_id}")
async def get_deck(deck_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(404, "Deck not found")
    return deck.to_dict()


@router.put("/{deck_id}")
async def update_deck(deck_id: int, req: UpdateDeckReq, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(404, "Deck not found")
    if req.name:
        deck.name = req.name
    if req.cards is not None:
        total = sum(c.quantity for c in req.cards)
        if total != DECK_SIZE:
            raise HTTPException(400, f"Deck must have {DECK_SIZE} cards")
        for dc in deck.cards:
            await db.delete(dc)
        await db.flush()
        for ci in req.cards:
            db.add(DeckCard(deck_id=deck.id, card_template_id=ci.card_template_id, quantity=ci.quantity))
    await db.commit()
    await db.refresh(deck)
    return deck.to_dict()


@router.delete("/{deck_id}")
async def delete_deck(deck_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(404, "Deck not found")
    await db.delete(deck)
    await db.commit()
    return {"deleted": True}
