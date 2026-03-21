"""덱 CRUD."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import DECK_SIZE
from database import get_db
from models.deck import Deck, DeckCard
from models.player import Player

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


class SelectDeckReq(BaseModel):
    player_id: int


@router.post("/")
async def create_deck(req: CreateDeckReq, db: AsyncSession = Depends(get_db)):
    total = sum(c.quantity for c in req.cards)
    if total != DECK_SIZE:
        raise HTTPException(400, f"Deck must have {DECK_SIZE} cards, got {total}")

    player_result = await db.execute(select(Player).where(Player.id == req.player_id))
    player = player_result.scalar_one_or_none()
    if not player:
        raise HTTPException(404, "Player not found")

    deck = Deck(player_id=req.player_id, name=req.name)
    db.add(deck)
    await db.flush()

    for ci in req.cards:
        db.add(
            DeckCard(
                deck_id=deck.id,
                card_template_id=ci.card_template_id,
                quantity=ci.quantity,
            )
        )

    if not player.selected_deck_id:
        player.selected_deck_id = deck.id

    await db.commit()
    await db.refresh(deck)
    return deck.to_dict()


@router.get("/player/{player_id}")
async def list_decks(player_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Deck).where(Deck.player_id == player_id).order_by(Deck.id.asc()))
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

    if req.name is not None:
        deck.name = req.name

    if req.cards is not None:
        total = sum(c.quantity for c in req.cards)
        if total != DECK_SIZE:
            raise HTTPException(400, f"Deck must have {DECK_SIZE} cards, got {total}")

        for dc in list(deck.cards):
            await db.delete(dc)
        await db.flush()

        for ci in req.cards:
            db.add(
                DeckCard(
                    deck_id=deck.id,
                    card_template_id=ci.card_template_id,
                    quantity=ci.quantity,
                )
            )

    await db.commit()
    await db.refresh(deck)
    return deck.to_dict()


@router.post("/{deck_id}/select")
async def select_deck(deck_id: int, req: SelectDeckReq, db: AsyncSession = Depends(get_db)):
    deck_result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = deck_result.scalar_one_or_none()
    if not deck:
        raise HTTPException(404, "Deck not found")

    if deck.player_id != req.player_id:
        raise HTTPException(403, "This deck does not belong to the player")

    player_result = await db.execute(select(Player).where(Player.id == req.player_id))
    player = player_result.scalar_one_or_none()
    if not player:
        raise HTTPException(404, "Player not found")

    player.selected_deck_id = deck.id
    await db.commit()
    return {"success": True, "selected_deck_id": deck.id}


@router.delete("/{deck_id}")
async def delete_deck(deck_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Deck).where(Deck.id == deck_id))
    deck = result.scalar_one_or_none()
    if not deck:
        raise HTTPException(404, "Deck not found")

    player_result = await db.execute(select(Player).where(Player.id == deck.player_id))
    player = player_result.scalar_one_or_none()

    deleting_selected = player and player.selected_deck_id == deck.id

    await db.delete(deck)
    await db.flush()

    if player and deleting_selected:
        remain_result = await db.execute(
            select(Deck).where(Deck.player_id == player.id).order_by(Deck.id.asc())
        )
        next_deck = remain_result.scalars().first()
        player.selected_deck_id = next_deck.id if next_deck else None

    await db.commit()
    return {"deleted": True}