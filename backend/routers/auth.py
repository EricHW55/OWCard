"""회원가입 / 로그인 / JWT."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timezone

from database import get_db
from models.player import Player
from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE

from uuid import uuid4
from pydantic import BaseModel


router = APIRouter(prefix="/auth", tags=["auth"])
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterReq(BaseModel):
    username: str
    password: str
    nickname: str


class LoginReq(BaseModel):
    username: str
    password: str


class TokenRes(BaseModel):
    access_token: str
    token_type: str = "bearer"
    player_id: int
    nickname: str


def create_token(player_id: int, username: str) -> str:
    exp = datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRE
    return jwt.encode({"sub": str(player_id), "username": username, "exp": exp},
                      SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.post("/register", response_model=TokenRes)
async def register(req: RegisterReq, db: AsyncSession = Depends(get_db)):
    exists = await db.execute(select(Player).where(Player.username == req.username))
    if exists.scalar_one_or_none():
        raise HTTPException(400, "Username taken")
    p = Player(username=req.username, hashed_password=pwd.hash(req.password), nickname=req.nickname)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return TokenRes(access_token=create_token(p.id, p.username), player_id=p.id, nickname=p.nickname)


@router.post("/login", response_model=TokenRes)
async def login(req: LoginReq, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Player).where(Player.username == req.username))
    p = result.scalar_one_or_none()
    if not p or not pwd.verify(req.password, p.hashed_password):
        raise HTTPException(401, "Invalid credentials")
    return TokenRes(access_token=create_token(p.id, p.username), player_id=p.id, nickname=p.nickname)



class GuestReq(BaseModel):
    nickname: str


@router.post("/guest", response_model=TokenRes)
async def guest_login(req: GuestReq, db: AsyncSession = Depends(get_db)):
    try:
        nickname = req.nickname.strip()
        if len(nickname) < 2:
            raise HTTPException(400, "Nickname too short")
        if len(nickname) > 20:
            raise HTTPException(400, "Nickname too long")

        username = f"guest_{uuid4().hex[:10]}"

        p = Player(
            username=username,
            hashed_password="__guest__",
            nickname=nickname,
        )
        db.add(p)
        await db.commit()
        await db.refresh(p)

        return TokenRes(
            access_token=create_token(p.id, p.username),
            player_id=p.id,
            nickname=p.nickname,
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"guest login failed: {str(e)}")