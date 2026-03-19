"""FIFO 큐 매칭. 2명이 모이면 즉시 매칭."""
from __future__ import annotations
import asyncio
import uuid
from dataclasses import dataclass
from typing import Optional


@dataclass
class QueueEntry:
    player_id: int
    username: str
    deck_id: int


class MatchmakingService:

    def __init__(self):
        self.queue: list[QueueEntry] = []
        self._lock = asyncio.Lock()

    async def join_queue(self, player_id: int, username: str, deck_id: int) -> Optional[dict]:
        async with self._lock:
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
            self.queue = [e for e in self.queue if e.player_id != player_id]

    def queue_size(self) -> int:
        return len(self.queue)


matchmaking = MatchmakingService()
