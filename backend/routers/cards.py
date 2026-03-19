"""카드 조회 + 밸런스 패치.

패치 예시:
  PATCH /cards/1 → {"hp": 25, "skill_damages": {"skill_1": 7}}
  라인하르트 체력 25, 화염강타 7뎀으로 변경. 코드 수정 불필요.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from database import get_db
from models.card import CardTemplate

router = APIRouter(prefix="/cards", tags=["cards"])


class PatchCardReq(BaseModel):
    """밸런스 패치: 원하는 필드만 업데이트."""
    hp: int | None = None
    base_attack: int | None = None
    base_defense: int | None = None
    base_attack_range: int | None = None
    cost: int | None = None
    description: str | None = None
    skill_damages: dict | None = None
    skill_meta: dict | None = None
    extra: dict | None = None


@router.get("/")
async def list_cards(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CardTemplate))
    return [c.to_dict() for c in result.scalars().all()]


@router.get("/{card_id}")
async def get_card(card_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CardTemplate).where(CardTemplate.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Card not found")
    return card.to_dict()


@router.patch("/{card_id}")
async def patch_card(card_id: int, req: PatchCardReq, db: AsyncSession = Depends(get_db)):
    """밸런스 패치: 숫자만 바꿔도 즉시 반영."""
    result = await db.execute(select(CardTemplate).where(CardTemplate.id == card_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Card not found")
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(card, k, v)
    await db.commit()
    await db.refresh(card)
    return card.to_dict()