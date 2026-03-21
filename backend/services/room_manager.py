"""커스텀 방 생성 + 관전 기능."""
from __future__ import annotations
import uuid
import asyncio
from dataclasses import dataclass, field as dc_field
from typing import Optional
from enum import Enum


class RoomStatus(str, Enum):
    WAITING = "waiting"
    READY = "ready"
    IN_GAME = "in_game"
    FINISHED = "finished"


@dataclass
class Room:
    room_id: str
    room_code: str
    host_id: int
    host_username: str
    host_deck_id: Optional[int] = None
    guest_id: Optional[int] = None
    guest_username: Optional[str] = None
    guest_deck_id: Optional[int] = None
    game_id: Optional[str] = None
    status: RoomStatus = RoomStatus.WAITING
    spectator_ids: list[int] = dc_field(default_factory=list)
    max_spectators: int = 10

    def to_dict(self) -> dict:
        return {
            "room_id": self.room_id,
            "room_code": self.room_code,
            "host": {"id": self.host_id, "username": self.host_username},
            "guest": {"id": self.guest_id, "username": self.guest_username} if self.guest_id else None,
            "status": self.status.value,
            "spectator_count": len(self.spectator_ids),
            "game_id": self.game_id,
        }


class RoomManager:

    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self.code_map: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def create_room(self, host_id: int, host_username: str) -> Room:
        async with self._lock:
            rid = f"room_{uuid.uuid4().hex[:12]}"
            code = uuid.uuid4().hex[:6].upper()
            room = Room(room_id=rid, room_code=code, host_id=host_id, host_username=host_username)
            self.rooms[rid] = room
            self.code_map[code] = rid
            return room

    async def join_room(self, code: str, player_id: int, username: str) -> Optional[Room]:
        async with self._lock:
            rid = self.code_map.get(code)
            if not rid:
                return None
            room = self.rooms.get(rid)
            if not room or room.status != RoomStatus.WAITING or room.host_id == player_id:
                return None
            room.guest_id = player_id
            room.guest_username = username
            room.status = RoomStatus.READY
            return room

    async def add_spectator(self, code: str, spectator_id: int) -> Optional[Room]:
        async with self._lock:
            rid = self.code_map.get(code)
            if not rid:
                return None
            room = self.rooms.get(rid)
            if not room or len(room.spectator_ids) >= room.max_spectators:
                return None
            if spectator_id not in room.spectator_ids:
                room.spectator_ids.append(spectator_id)
            return room

    async def set_deck(self, room_id: str, player_id: int, deck_id: int) -> bool:
        room = self.rooms.get(room_id)
        if not room:
            return False
        if player_id == room.host_id:
            room.host_deck_id = deck_id
        elif player_id == room.guest_id:
            room.guest_deck_id = deck_id
        else:
            return False
        return True

    async def start_game(self, room_id: str) -> Optional[dict]:
        room = self.rooms.get(room_id)
        if not room or room.status != RoomStatus.READY:
            return None
        if not room.host_deck_id or not room.guest_deck_id:
            return None
        gid = f"game_{uuid.uuid4().hex[:12]}"
        room.game_id = gid
        room.status = RoomStatus.IN_GAME
        return {
            "game_id": gid,
            "room_id": room_id,
            "player1": {"id": room.host_id, "username": room.host_username, "deck_id": room.host_deck_id},
            "player2": {"id": room.guest_id, "username": room.guest_username, "deck_id": room.guest_deck_id},
        }

    async def close_room(self, room_id: str):
        room = self.rooms.pop(room_id, None)
        if room:
            self.code_map.pop(room.room_code, None)

    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)

    def get_room_by_code(self, code: str) -> Optional[Room]:
        rid = self.code_map.get(code)
        return self.rooms.get(rid) if rid else None

    def list_rooms(self) -> list[dict]:
        return [r.to_dict() for r in self.rooms.values() if r.status != RoomStatus.FINISHED]

    def find_room_by_game_id(self, game_id: str) -> Optional[Room]:
        """game_id로 방 찾기."""
        for room in self.rooms.values():
            if room.game_id == game_id:
                return room
        return None

    async def close_room_by_game_id(self, game_id: str):
        """게임 종료 시 해당 방 정리."""
        room = self.find_room_by_game_id(game_id)
        if room:
            room.status = RoomStatus.FINISHED
            await self.close_room(room.room_id)


room_manager = RoomManager()
