"""
게임 WebSocket 핸들러.

클라이언트 → 서버 프로토콜:
  {"action":"mulligan","card_indices":[0,3]}
  {"action":"skip_mulligan"}
  {"action":"place_card","hand_index":2,"zone":"main"}
  {"action":"end_placement"}
  {"action":"basic_attack","attacker_uid":"abc","target_uid":"def"}
  {"action":"use_skill","caster_uid":"abc","skill_key":"skill_1","target_uid":"def"}
  {"action":"execute_spell","hero_key":"spell_riptire","target_uid":"def"}
  {"action":"end_turn"}
  {"action":"get_state"}
  {"action":"surrender"}
"""
from __future__ import annotations
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from database import async_session
from models.card import CardTemplate
from models.deck import Deck
from game_engine.engine import GameEngine, GamePhase
from services.ws_manager import manager
from services.room_manager import room_manager
from routers.auth import verify_token

router = APIRouter()

# 활성 게임 (메모리 — 동접 20명 규모에 적합)
active_games: dict[str, GameEngine] = {}


# ── 덱 로드 ───────────────────────────────────

async def load_deck_cards(deck_id: int) -> list[dict]:
    async with async_session() as db:
        result = await db.execute(select(Deck).where(Deck.id == deck_id))
        deck = result.scalar_one_or_none()
        if not deck:
            return []
        cards: list[dict] = []
        for dc in deck.cards:
            tmpl = await db.execute(select(CardTemplate).where(CardTemplate.id == dc.card_template_id))
            t = tmpl.scalar_one_or_none()
            if t:
                for _ in range(dc.quantity):
                    cards.append(t.to_game_dict())  # 게임 엔진용 형태
        return cards


async def get_or_create_game(game_id: str, p1: dict, p2: dict) -> GameEngine:
    if game_id in active_games:
        return active_games[game_id]
    engine = GameEngine(game_id)
    engine.add_player(p1["id"], p1["username"], await load_deck_cards(p1["deck_id"]))
    engine.add_player(p2["id"], p2["username"], await load_deck_cards(p2["deck_id"]))
    active_games[game_id] = engine
    return engine


# ── 게임 WS ───────────────────────────────────

@router.websocket("/ws/game/{game_id}")
async def game_ws(
    ws: WebSocket,
    game_id: str,
    token: str = Query(...),
    player_id: int = Query(...),
):
    try:
        payload = verify_token(token)
        if int(payload["sub"]) != player_id:
            await ws.close(code=4001)
            return
    except Exception:
        await ws.close(code=4001)
        return

    engine = active_games.get(game_id)
    if not engine:
        await ws.close(code=4004, reason="Game not found")
        return
    if player_id not in engine.players:
        await ws.close(code=4003, reason="Not a player")
        return

    await manager.connect_game(game_id, player_id, ws)
    engine.players[player_id].connected = True

    try:
        await _send_state(game_id, player_id, engine)

        # 양쪽 접속 시 게임 시작
        if (all(p.connected for p in engine.players.values())
                and engine.phase == GamePhase.WAITING):
            engine.start_game()
            for pid in engine.players:
                await _send_state(game_id, pid, engine)
                await manager.send_game(game_id, pid, {
                    "event": "phase_change", "phase": engine.phase.value,
                    "message": "멀리건 시작! 최대 2장 교체 가능",
                })

        while True:
            data = await ws.receive_json()
            await _handle_action(game_id, player_id, data, engine)

    except WebSocketDisconnect:
        engine.players[player_id].connected = False
        manager.disconnect_game(game_id, player_id)

        # 게임이 아직 진행 중이면 → 상대 승리 + 방 정리
        if engine.phase != GamePhase.GAME_OVER:
            opp = [pid for pid in engine.players if pid != player_id]
            if opp:
                engine.winner = opp[0]
                engine.phase = GamePhase.GAME_OVER
                await manager.send_game(game_id, opp[0], {
                    "event": "opponent_disconnected",
                })
                await _handle_game_over(game_id, engine)
        await manager.broadcast_spectators(game_id, {
            "event": "player_disconnected", "player_id": player_id,
        })


async def _handle_action(game_id: str, player_id: int, data: dict, engine: GameEngine):
    action = data.get("action", "")
    result: dict = {}

    if action == "mulligan":
        result = engine.mulligan(player_id, data.get("card_indices", []))
    elif action == "skip_mulligan":
        result = engine.skip_mulligan(player_id)
    elif action == "place_card":
        result = engine.place_card(player_id, data.get("hand_index", 0), data.get("zone", "main"))
    elif action == "end_placement":
        result = engine.end_placement(player_id)
    elif action == "basic_attack":
        result = engine.basic_attack(player_id, data.get("attacker_uid", ""), data.get("target_uid", ""))
    elif action == "use_skill":
        result = engine.use_skill(
            player_id, data.get("caster_uid", ""),
            data.get("skill_key", ""), data.get("target_uid"),
        )
    elif action == "execute_spell":
        result = engine.execute_spell(
            player_id, data.get("hero_key", ""),
            data.get("target_uid"),
        )
    elif action == "end_turn":
        result = engine.end_turn(player_id)
    elif action == "get_state":
        await _send_state(game_id, player_id, engine)
        return
    elif action == "surrender":
        opp_id = [pid for pid in engine.players if pid != player_id][0]
        engine.winner = opp_id
        engine.phase = GamePhase.GAME_OVER
        result = {"event": "surrender", "winner": opp_id}
    elif action == "leave_game":
        # 나가기 = 항복과 동일
        opp_id = [pid for pid in engine.players if pid != player_id][0]
        engine.winner = opp_id
        engine.phase = GamePhase.GAME_OVER
        result = {"event": "surrender", "winner": opp_id, "reason": "leave"}
    else:
        await manager.send_game(game_id, player_id, {"event": "error", "message": f"Unknown: {action}"})
        return

    # 에러
    if "error" in result:
        await manager.send_game(game_id, player_id, {"event": "error", "message": result["error"]})
        return

    # 결과 전송
    await manager.send_game(game_id, player_id, {"event": "action_result", "action": action, "result": result})

    # 상대에게 알림
    opp_ids = [pid for pid in engine.players if pid != player_id]
    if opp_ids:
        safe = {k: v for k, v in result.items() if k != "hand"}
        await manager.send_game(game_id, opp_ids[0], {"event": "opponent_action", "action": action, "result": safe})

    # 관전자
    await manager.broadcast_spectators(game_id, {
        "event": "game_action", "player_id": player_id,
        "action": action, "spectator_state": engine.get_spectator_state(),
    })

    # 페이즈 변경 시 양쪽 상태 갱신
    if action in ("mulligan", "skip_mulligan", "end_placement", "end_turn",
                   "surrender", "place_card", "use_skill", "basic_attack", "execute_spell"):
        for pid in engine.players:
            await _send_state(game_id, pid, engine)

    # 게임 오버
    if engine.phase == GamePhase.GAME_OVER:
        await _handle_game_over(game_id, engine)


async def _send_state(game_id: str, player_id: int, engine: GameEngine):
    await manager.send_game(game_id, player_id, {"event": "game_state", "state": engine.get_state(player_id)})


async def _handle_game_over(game_id: str, engine: GameEngine):
    winner_id = engine.winner
    loser_id = [pid for pid in engine.players if pid != winner_id][0] if winner_id else None

    if winner_id and loser_id:
        async with async_session() as db:
            from models.player import Player
            for pid, attr in ((winner_id, "wins"), (loser_id, "losses")):
                r = await db.execute(select(Player).where(Player.id == pid))
                p = r.scalar_one_or_none()
                if p:
                    setattr(p, attr, getattr(p, attr) + 1)
            await db.commit()

    await manager.broadcast_all(game_id, {
        "event": "game_over", "winner": winner_id,
        "winner_name": engine.players[winner_id].username if winner_id else None,
    })

    # 방 정리 + 게임 삭제 (즉시)
    await room_manager.close_room_by_game_id(game_id)
    active_games.pop(game_id, None)
    manager.cleanup_game(game_id)


# ── 관전 WS ───────────────────────────────────

@router.websocket("/ws/spectate/{game_id}")
async def spectate_ws(ws: WebSocket, game_id: str):
    engine = active_games.get(game_id)
    if not engine:
        await ws.close(code=4004)
        return
    await manager.connect_spectator(game_id, ws)
    try:
        await ws.send_json({"event": "spectator_state", "state": engine.get_spectator_state()})
        while True:
            data = await ws.receive_json()
            if data.get("action") == "get_state":
                await ws.send_json({"event": "spectator_state", "state": engine.get_spectator_state()})
    except WebSocketDisconnect:
        manager.disconnect_spectator(game_id, ws)


# ── 매칭/방에서 호출하는 헬퍼 ─────────────────

async def create_game_from_match(match_data: dict) -> str:
    game_id = match_data["game_id"]
    await get_or_create_game(game_id, match_data["player1"], match_data["player2"])
    return game_id