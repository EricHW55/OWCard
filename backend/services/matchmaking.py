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
    match_format: str = "bo1"


@dataclass
class RecentMatchEntry:
    game_id: str
    opponent: dict
    created_at: float
    match_format: str = "bo1"


class MatchmakingService:

    def __init__(self):
        self.queue_by_format: dict[str, list[QueueEntry]] = {
            "bo1": [],
            "bo3": [],
        }
        self._lock = asyncio.Lock()
        self._recent_matches: dict[int, RecentMatchEntry] = {}
        self._match_ttl_seconds = 60.0

    async def join_queue(self, player_id: int, username: str, deck_id: int, match_format: str = "bo1") -> Optional[dict]:
        normalized_format = "bo3" if str(match_format).lower() == "bo3" else "bo1"
        async with self._lock:
            self._cleanup_expired_locked()
            if any(e.player_id == player_id for queue in self.queue_by_format.values() for e in queue):
                return None
            queue = self.queue_by_format[normalized_format]
            queue.append(QueueEntry(player_id, username, deck_id, normalized_format))
            if len(queue) >= 2:
                p1, p2 = queue.pop(0), queue.pop(0)
                return {
                    "game_id": f"game_{uuid.uuid4().hex[:12]}",
                    "match_format": normalized_format,
                    "player1": {"id": p1.player_id, "username": p1.username, "deck_id": p1.deck_id},
                    "player2": {"id": p2.player_id, "username": p2.username, "deck_id": p2.deck_id},
                }
            return None

    async def leave_queue(self, player_id: int):
        async with self._lock:
            self._cleanup_expired_locked()
            for format_key, queue in self.queue_by_format.items():
                self.queue_by_format[format_key] = [e for e in queue if e.player_id != player_id]

    def queue_size(self, match_format: str | None = None) -> int:
        if match_format:
            normalized_format = "bo3" if str(match_format).lower() == "bo3" else "bo1"
            return len(self.queue_by_format.get(normalized_format, []))
        return sum(len(queue) for queue in self.queue_by_format.values())
    
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
                match_format=str(match_data.get("match_format", "bo1")).lower(),
            )
            self._recent_matches[p2["id"]] = RecentMatchEntry(
                game_id=game_id,
                opponent=p1,
                created_at=now,
                match_format=str(match_data.get("match_format", "bo1")).lower(),
            )

    async def consume_recent_match_if_in_game(self, player_id: int):
        async with self._lock:
            self._recent_matches.pop(player_id, None)

    async def get_player_match_status(self, player_id: int) -> dict:
        now = time.monotonic()
        async with self._lock:
            self._cleanup_expired_locked(now)
            for match_format, queue in self.queue_by_format.items():
                if any(entry.player_id == player_id for entry in queue):
                    return {"state": "queued", "match_format": match_format}
            recent = self._recent_matches.get(player_id)
            if recent:
                return {
                    "state": "matched",
                    "game_id": recent.game_id,
                    "opponent": recent.opponent,
                    "match_format": recent.match_format,
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