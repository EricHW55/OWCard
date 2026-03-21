"""회원가입 / 로그인 / JWT."""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE
from database import get_db
from models.deck import Deck
from models.player import Player
from services.starter_deck import create_random_starter_deck

router = APIRouter(prefix="/auth", tags=["auth"])
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterReq(BaseModel):
    username: str
    password: str
    nickname: str


class LoginReq(BaseModel):
    username: str
    password: str


class GuestReq(BaseModel):
    nickname: str


class TokenRes(BaseModel):
    access_token: str
    token_type: str = "bearer"
    player_id: int
    nickname: str
    default_deck_id: int | None = None


def create_token(player_id: int, username: str) -> str:
    exp = datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRE
    return jwt.encode(
        {"sub": str(player_id), "username": username, "exp": exp},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


async def ensure_default_deck(db: AsyncSession, player: Player) -> int:
    # 이미 선택된 덱이 있으면 우선 사용
    if getattr(player, "selected_deck_id", None):
        result = await db.execute(
            select(Deck).where(
                Deck.id == player.selected_deck_id,
                Deck.player_id == player.id,
            )
        )
        selected = result.scalar_one_or_none()
        if selected:
            return selected.id

    # 없으면 첫 덱 탐색
    result = await db.execute(
        select(Deck).where(Deck.player_id == player.id).order_by(Deck.id.asc())
    )
    first_deck = result.scalars().first()

    # 덱이 하나도 없으면 스타터 덱 생성
    if not first_deck:
        first_deck = await create_random_starter_deck(db, player.id)
        await db.flush()

    player.selected_deck_id = first_deck.id
    await db.commit()
    await db.refresh(player)

    return first_deck.id


@router.post("/register", response_model=TokenRes)
async def register(req: RegisterReq, db: AsyncSession = Depends(get_db)):
    exists = await db.execute(select(Player).where(Player.username == req.username))
    if exists.scalar_one_or_none():
        raise HTTPException(400, "Username taken")

    p = Player(
        username=req.username,
        hashed_password=pwd.hash(req.password),
        nickname=req.nickname,
    )
    db.add(p)
    await db.flush()

    deck = await create_random_starter_deck(db, p.id)
    p.selected_deck_id = deck.id

    await db.commit()
    await db.refresh(p)

    return TokenRes(
        access_token=create_token(p.id, p.username),
        player_id=p.id,
        nickname=p.nickname,
        default_deck_id=p.selected_deck_id,
    )


@router.post("/login", response_model=TokenRes)
async def login(req: LoginReq, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Player).where(Player.username == req.username))
    p = result.scalar_one_or_none()
    if not p or not pwd.verify(req.password, p.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    default_deck_id = await ensure_default_deck(db, p)

    return TokenRes(
        access_token=create_token(p.id, p.username),
        player_id=p.id,
        nickname=p.nickname,
        default_deck_id=default_deck_id,
    )


@router.post("/guest", response_model=TokenRes)
async def guest_login(req: GuestReq, db: AsyncSession = Depends(get_db)):
    try:
        nickname = req.nickname.strip()
        if len(nickname) < 2:
            raise HTTPException(400, "Nickname too short")
        if len(nickname) > 20:
            raise HTTPException(400, "Nickname too long")

        # 같은 닉네임이면 기존 플레이어 재사용
        existing = await db.execute(select(Player).where(Player.nickname == nickname))
        p = existing.scalar_one_or_none()

        if p:
            default_deck_id = await ensure_default_deck(db, p)
            return TokenRes(
                access_token=create_token(p.id, p.username),
                player_id=p.id,
                nickname=p.nickname,
                default_deck_id=default_deck_id,
            )

        # 없으면 새 게스트 생성
        username = f"guest_{uuid4().hex[:10]}"
        p = Player(
            username=username,
            hashed_password="__guest__",
            nickname=nickname,
        )
        db.add(p)
        await db.flush()

        deck = await create_random_starter_deck(db, p.id)
        p.selected_deck_id = deck.id

        await db.commit()
        await db.refresh(p)

        return TokenRes(
            access_token=create_token(p.id, p.username),
            player_id=p.id,
            nickname=p.nickname,
            default_deck_id=p.selected_deck_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"guest login failed: {str(e)}")