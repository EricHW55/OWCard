"""관리자 전용 카드/스킬 밸런스 편집 API."""
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import ALGORITHM, SECRET_KEY
from database import get_db
from models.card import CardTemplate
from models.player import Player

router = APIRouter(prefix="/admin", tags=["admin"])


class PatchCardReq(BaseModel):
    hp: int | None = None
    base_attack: int | None = None
    base_defense: int | None = None
    base_attack_range: int | None = None
    cost: int | None = None
    description: str | None = None
    skill_damages: dict | None = None
    skill_meta: dict | None = None
    extra: dict | None = None


async def require_admin(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> Player:
    admin_nickname = os.getenv("ADMIN_NICKNAME", "").strip()
    if not admin_nickname:
        raise HTTPException(status_code=503, detail="ADMIN_NICKNAME is not configured")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.replace("Bearer ", "", 1).strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        player_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(Player).where(Player.id == player_id))
    player = result.scalar_one_or_none()
    if not player:
        raise HTTPException(status_code=401, detail="Player not found")

    if player.nickname != admin_nickname:
        raise HTTPException(status_code=403, detail="Admin only")

    return player


@router.get("/cards")
async def list_cards(_: Player = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CardTemplate).order_by(CardTemplate.is_spell.asc(), CardTemplate.role.asc(), CardTemplate.name.asc()))
    return [card.to_dict() for card in result.scalars().all()]


@router.patch("/cards/{card_id}")
async def patch_card(card_id: int, req: PatchCardReq, _: Player = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CardTemplate).where(CardTemplate.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    payload = req.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    for key, value in payload.items():
        setattr(card, key, value)

    await db.commit()
    await db.refresh(card)
    return card.to_dict()