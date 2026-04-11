"""
Card Battle Game — Backend
===========================
FastAPI + WebSocket + SQLite
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, async_session
from routers import auth, cards, decks, lobby, game_ws, lobby_ws
from seed_data import seed_cards


def parse_csv_env(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with async_session() as db:
        await seed_cards(db)

    print("✅ Database ready, cards seeded.")
    print("✅ CORS allow_origins =", app.state.cors_allow_origins)
    yield
    print("🔒 Shutting down.")


app = FastAPI(
    title="Card Battle Game API",
    description="턴제 카드 배틀 게임 백엔드 (SQLite → 호스팅 DB 전환 가능)",
    version="1.0.0",
    lifespan=lifespan,
)

cors_allow_origins = parse_csv_env(
    "CORS_ALLOW_ORIGINS",
    ",".join(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://web-owcard-frontend-mmxv5jrz842a887d.sel3.cloudtype.app",
            "https://www.owcard.xyz",
            "https://owcard.xyz",
        ]
    ),
)
cors_allow_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip()

app.state.cors_allow_origins = cors_allow_origins

cors_kwargs = dict(
    allow_origins=cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if cors_allow_origin_regex:
    cors_kwargs["allow_origin_regex"] = cors_allow_origin_regex

app.add_middleware(CORSMiddleware, **cors_kwargs)

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
        # "db": "SQLite",
        "db": os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./card_battle.db").split(":", 1)[0],
        "cors_allow_origins": app.state.cors_allow_origins,
        "endpoints": {
            "docs": "/docs",
            "auth": "/auth/register, /auth/login, /auth/guest",
            "cards": "/cards/",
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