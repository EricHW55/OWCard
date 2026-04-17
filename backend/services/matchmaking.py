"""FIFO 큐 매칭. 2명이 모이면 즉시 매칭."""
from __future__ import annotations
import asyncio
import time
import uuid
from dataclasses import dataclass
from typing import Optional


@dataclass
class QueueEntry:
    player_id: int
    username: str
    deck_id: int


@dataclass
class RecentMatchEntry:
    game_id: str
    opponent: dict
    created_at: float


class MatchmakingService:

    def __init__(self):
        self.queue: list[QueueEntry] = []
        self._lock = asyncio.Lock()
        self._recent_matches: dict[int, RecentMatchEntry] = {}
        self._match_ttl_seconds = 60.0

    async def join_queue(self, player_id: int, username: str, deck_id: int) -> Optional[dict]:
        async with self._lock:
            self._cleanup_expired_locked()
            if any(e.player_id == player_id for e in self.queue):
                return None
            self.queue.append(QueueEntry(player_id, username, deck_id))
            if len(self.queue) >= 2:
                p1, p2 = self.queue.pop(0), self.queue.pop(0)
                return {
                    "game_id": f"game_{uuid.uuid4().hex[:12]}",
                    "player1": {"id": p1.player_id, "username": p1.username, "deck_id": p1.deck_id},
                    "player2": {"id": p2.player_id, "username": p2.username, "deck_id": p2.deck_id},
                }
            return None

    async def leave_queue(self, player_id: int):
        async with self._lock:
            self._cleanup_expired_locked()
            self.queue = [e for e in self.queue if e.player_id != player_id]

    def queue_size(self) -> int:
        return len(self.queue)
    
    async def record_recent_match(self, match_data: dict):
        now = time.monotonic()
        async with self._lock:
            self._cleanup_expired_locked(now)
            p1 = match_data["player1"]
            p2 = match_data["player2"]
            game_id = match_data["game_id"]
            self._recent_matches[p1["id"]] = RecentMatchEntry(
                game_id=game_id,
                opponent=p2,
                created_at=now,
            )
            self._recent_matches[p2["id"]] = RecentMatchEntry(
                game_id=game_id,
                opponent=p1,
                created_at=now,
            )

    async def consume_recent_match_if_in_game(self, player_id: int):
        async with self._lock:
            self._recent_matches.pop(player_id, None)

    async def get_player_match_status(self, player_id: int) -> dict:
        now = time.monotonic()
        async with self._lock:
            self._cleanup_expired_locked(now)
            if any(entry.player_id == player_id for entry in self.queue):
                return {"state": "queued"}
            recent = self._recent_matches.get(player_id)
            if recent:
                return {
                    "state": "matched",
                    "game_id": recent.game_id,
                    "opponent": recent.opponent,
                }
            return {"state": "idle"}

    def _cleanup_expired_locked(self, now: float | None = None):
        if now is None:
            now = time.monotonic()
        expired_players = [
            player_id
            for player_id, entry in self._recent_matches.items()
            if now - entry.created_at > self._match_ttl_seconds
        ]
        for player_id in expired_players:
            self._recent_matches.pop(player_id, None)


matchmaking = MatchmakingService()