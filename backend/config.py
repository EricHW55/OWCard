"""Application configuration."""
import os
from datetime import timedelta

# ── SQLite (로컬 개발용, 나중에 호스팅 DB로 교체) ──
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./card_battle.db",
)

# ── Auth ───────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production-abc123xyz")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)

# ── Game constants ─────────────────────────────
DECK_SIZE = 20
HAND_SIZE = 10
MAX_MULLIGAN = 2
CARDS_PER_TURN = 2      # 일반 카드 기준
TANK_COST = 2            # 탱커는 2장 취급
TRASH_WIN_COUNT = 10

# Field limits
MAIN_MAX_TANK = 1
MAIN_MAX_DEALER = 2
MAIN_MAX_HEALER = 2
SIDE_MAX_SLOTS = 2       # 딜러+힐러 각1 또는 탱커1
