"""WebSocket connection manager — lobby / game / spectator channels."""
from __future__ import annotations
from typing import Optional
from fastapi import WebSocket


class ConnectionManager:

    def __init__(self):
        self.game_conns: dict[str, dict[int, WebSocket]] = {}
        self.spectator_conns: dict[str, list[WebSocket]] = {}
        self.lobby_conns: dict[int, WebSocket] = {}

    async def connect_lobby(self, player_id: int, ws: WebSocket):
        await ws.accept()
        self.lobby_conns[player_id] = ws

    def disconnect_lobby(self, player_id: int):
        self.lobby_conns.pop(player_id, None)

    async def send_lobby(self, player_id: int, data: dict):
        ws = self.lobby_conns.get(player_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception as e:
                print(f"[WS] send_lobby failed player={player_id}: {e}")
                self.disconnect_lobby(player_id)

    async def connect_game(self, game_id: str, player_id: int, ws: WebSocket):
        await ws.accept()
        self.game_conns.setdefault(game_id, {})[player_id] = ws

    def disconnect_game(self, game_id: str, player_id: int):
        conns = self.game_conns.get(game_id)
        if conns:
            conns.pop(player_id, None)
            if not conns:
                del self.game_conns[game_id]

    async def send_game(self, game_id: str, player_id: int, data: dict):
        ws = self.game_conns.get(game_id, {}).get(player_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception as e:
                print(f"[WS] send_game failed game={game_id} player={player_id}: {e}")
                self.disconnect_game(game_id, player_id)

    async def broadcast_game(self, game_id: str, data: dict, exclude: Optional[int] = None):
        for pid, ws in list(self.game_conns.get(game_id, {}).items()):
            if pid == exclude:
                continue
            try:
                await ws.send_json(data)
            except Exception as e:
                print(f"[WS] broadcast_game failed game={game_id} player={pid}: {e}")
                self.disconnect_game(game_id, pid)

    async def connect_spectator(self, game_id: str, ws: WebSocket):
        await ws.accept()
        self.spectator_conns.setdefault(game_id, []).append(ws)

    def disconnect_spectator(self, game_id: str, ws: WebSocket):
        lst = self.spectator_conns.get(game_id)
        if lst:
            self.spectator_conns[game_id] = [w for w in lst if w != ws]

    async def broadcast_spectators(self, game_id: str, data: dict):
        for ws in list(self.spectator_conns.get(game_id, [])):
            try:
                await ws.send_json(data)
            except Exception as e:
                print(f"[WS] broadcast_spectators failed game={game_id}: {e}")
                self.disconnect_spectator(game_id, ws)

    async def broadcast_all(self, game_id: str, data: dict):
        await self.broadcast_game(game_id, data)
        await self.broadcast_spectators(game_id, data)

    def cleanup_game(self, game_id: str):
        self.game_conns.pop(game_id, None)
        self.spectator_conns.pop(game_id, None)


manager = ConnectionManager()
