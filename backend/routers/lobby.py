"""매칭 큐 + 커스텀 방 REST API."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.matchmaking import matchmaking
from services.room_manager import room_manager

router = APIRouter(tags=["lobby"])


# ── 퀵매칭 ────────────────────────────────────

class QueueJoinReq(BaseModel):
    player_id: int
    username: str
    deck_id: int


@router.post("/matchmaking/join")
async def join_queue(req: QueueJoinReq):
    result = await matchmaking.join_queue(req.player_id, req.username, req.deck_id)
    if result:
        return {"matched": True, **result}
    return {"matched": False, "queue_size": matchmaking.queue_size()}


@router.post("/matchmaking/leave")
async def leave_queue(player_id: int):
    await matchmaking.leave_queue(player_id)
    return {"left": True}


@router.get("/matchmaking/status")
async def queue_status():
    return {"queue_size": matchmaking.queue_size()}


# ── 커스텀 방 ──────────────────────────────────

class CreateRoomReq(BaseModel):
    player_id: int
    username: str


class JoinRoomReq(BaseModel):
    room_code: str
    player_id: int
    username: str


class SetDeckReq(BaseModel):
    player_id: int
    deck_id: int


class SpectateReq(BaseModel):
    room_code: str
    spectator_id: int


@router.post("/rooms/create")
async def create_room(req: CreateRoomReq):
    room = await room_manager.create_room(req.player_id, req.username)
    return room.to_dict()


@router.post("/rooms/join")
async def join_room(req: JoinRoomReq):
    room = await room_manager.join_room(req.room_code, req.player_id, req.username)
    if not room:
        raise HTTPException(404, "Room not found or full")
    return room.to_dict()


@router.post("/rooms/{room_id}/deck")
async def set_room_deck(room_id: str, req: SetDeckReq):
    if not await room_manager.set_deck(room_id, req.player_id, req.deck_id):
        raise HTTPException(400, "Cannot set deck")
    return {"success": True}


@router.post("/rooms/{room_id}/start")
async def start_room_game(room_id: str):
    result = await room_manager.start_game(room_id)
    if not result:
        raise HTTPException(400, "Cannot start (not ready or decks missing)")
    return result


@router.post("/rooms/spectate")
async def spectate_room(req: SpectateReq):
    room = await room_manager.add_spectator(req.room_code, req.spectator_id)
    if not room:
        raise HTTPException(404, "Room not found or full")
    return room.to_dict()


@router.get("/rooms")
async def list_rooms():
    return room_manager.list_rooms()


@router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    return room.to_dict()


@router.get("/rooms/code/{room_code}")
async def get_room_by_code(room_code: str):
    room = room_manager.get_room_by_code(room_code)
    if not room:
        raise HTTPException(404, "Room not found")
    return room.to_dict()
