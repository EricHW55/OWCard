"""
Card Battle Game — Backend
===========================
FastAPI + WebSocket + SQLite

실행:
  1. conda activate card_game
  2. pip install -r requirements.txt
  3. uvicorn main:app --host 0.0.0.0 --port 8000 --reload

DB 파일(card_battle.db)이 자동 생성됩니다.
나중에 호스팅 DB로 전환 시 config.py의 DATABASE_URL만 변경.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, async_session
from routers import auth, cards, decks, lobby, game_ws, lobby_ws
from seed_data import seed_cards


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 시작: DB 테이블 생성 (Alembic 없을 때 폴백) + 시드
    await init_db()
    async with async_session() as db:
        await seed_cards(db)
    print("✅ Database ready, cards seeded.")
    yield
    print("🔒 Shutting down.")


app = FastAPI(
    title="Card Battle Game API",
    description="턴제 카드 배틀 게임 백엔드 (SQLite → 호스팅 DB 전환 가능)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# REST
app.include_router(auth.router)
app.include_router(cards.router)
app.include_router(decks.router)
app.include_router(lobby.router)

# WebSocket
app.include_router(game_ws.router)
app.include_router(lobby_ws.router)


@app.get("/")
async def root():
    return {
        "name": "Card Battle Game API",
        "version": "1.0.0",
        "db": "SQLite",
        "endpoints": {
            "docs": "/docs",
            "auth": "/auth/register, /auth/login",
            "cards": "/cards (밸런스: PATCH /cards/{id})",
            "decks": "/decks",
            "matchmaking": "/matchmaking/join, /matchmaking/leave",
            "rooms": "/rooms/create, /rooms/join, /rooms/{id}/start",
            "ws_lobby": "/ws/lobby?token=&player_id=&username=",
            "ws_game": "/ws/game/{game_id}?token=&player_id=",
            "ws_spectate": "/ws/spectate/{game_id}",
        },
    }


@app.get("/health")
async def health():
    from routers.game_ws import active_games
    from services.matchmaking import matchmaking
    from services.room_manager import room_manager
    return {
        "status": "ok",
        "active_games": len(active_games),
        "queue_size": matchmaking.queue_size(),
        "active_rooms": len(room_manager.rooms),
    }
