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
  {"action":"resolve_passive_choice","trash_index":0}
  {"action":"end_turn"}
  {"action":"get_state"}
  {"action":"ping"}
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

active_games: dict[str, GameEngine] = {}
RECONNECT_GRACE = 30
_disconnect_tasks: dict[tuple[str, int], asyncio.Task] = {}


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
                    cards.append(t.to_game_dict())
        return cards


async def get_or_create_game(game_id: str, p1: dict, p2: dict) -> GameEngine:
    if game_id in active_games:
        return active_games[game_id]
    engine = GameEngine(game_id)
    engine.add_player(p1["id"], p1["username"], await load_deck_cards(p1["deck_id"]))
    engine.add_player(p2["id"], p2["username"], await load_deck_cards(p2["deck_id"]))
    active_games[game_id] = engine
    return engine


def _cancel_disconnect_task(game_id: str, player_id: int):
    key = (game_id, player_id)
    task = _disconnect_tasks.pop(key, None)
    if task and not task.done():
        task.cancel()


async def _delayed_forfeit(game_id: str, player_id: int):
    try:
        await asyncio.sleep(RECONNECT_GRACE)
        engine = active_games.get(game_id)
        if not engine:
            return

        player = engine.players.get(player_id)
        if not player or player.connected or engine.phase == GamePhase.GAME_OVER:
            return

        opp_ids = [pid for pid in engine.players if pid != player_id]
        if not opp_ids:
            return

        engine.winner = opp_ids[0]
        engine.phase = GamePhase.GAME_OVER
        await manager.send_game(game_id, opp_ids[0], {"event": "opponent_disconnected"})
        await _handle_game_over(game_id, engine)
    except asyncio.CancelledError:
        return


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
    was_disconnected = not engine.players[player_id].connected
    engine.players[player_id].connected = True
    _cancel_disconnect_task(game_id, player_id)

    try:
        await _send_state(game_id, player_id, engine)

        if was_disconnected:
            opp_ids = [pid for pid in engine.players if pid != player_id]
            if opp_ids:
                await manager.send_game(game_id, opp_ids[0], {"event": "player_reconnected", "player_id": player_id})
            await manager.broadcast_spectators(game_id, {"event": "player_reconnected", "player_id": player_id})

        if all(p.connected for p in engine.players.values()) and engine.phase == GamePhase.WAITING:
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
        _cancel_disconnect_task(game_id, player_id)
        _disconnect_tasks[(game_id, player_id)] = asyncio.create_task(_delayed_forfeit(game_id, player_id))
        await manager.broadcast_spectators(game_id, {"event": "player_disconnected", "player_id": player_id})
    except Exception as e:
        print(f"[GAME_WS] unexpected error game={game_id} player={player_id}: {e}")
        engine.players[player_id].connected = False
        manager.disconnect_game(game_id, player_id)
        _cancel_disconnect_task(game_id, player_id)
        _disconnect_tasks[(game_id, player_id)] = asyncio.create_task(_delayed_forfeit(game_id, player_id))
        await manager.broadcast_spectators(game_id, {"event": "player_disconnected", "player_id": player_id})


async def _handle_action(game_id: str, player_id: int, data: dict, engine: GameEngine):
    action = data.get("action", "")
    result: dict = {}

    pending = getattr(engine.players.get(player_id), "pending_passive", None)
    allowed_when_pending = {"get_state", "resolve_passive_choice", "surrender", "leave_game", "ping"}
    if pending and action not in allowed_when_pending:
        await manager.send_game(game_id, player_id, {"event": "error", "message": "패시브 선택을 먼저 완료하세요"})
        return

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
        result = engine.use_skill(player_id, data.get("caster_uid", ""), data.get("skill_key", ""), data.get("target_uid"))
    elif action == "execute_spell":
        result = engine.execute_spell(
            player_id=player_id,
            hero_key=data.get("hero_key", ""),
            target_uid=data.get("target_uid"),
            trash_index=data.get("trash_index"),
            draw_index=data.get("draw_index"),
        )
    elif action == "end_turn":
        result = engine.end_turn(player_id)
    elif action == "resolve_passive_choice":
        result = engine.resolve_passive_choice(
            player_id,
            trash_index=data.get("trash_index"),
            hand_index=data.get("hand_index"),
            zone=data.get("zone"),
            skip=bool(data.get("skip", False)),
        )
    elif action == "get_state":
        await _send_state(game_id, player_id, engine)
        return
    elif action == "ping":
        await manager.send_game(game_id, player_id, {"event": "pong"})
        return
    elif action == "surrender":
        opp_id = [pid for pid in engine.players if pid != player_id][0]
        engine.winner = opp_id
        engine.phase = GamePhase.GAME_OVER
        result = {"event": "surrender", "winner": opp_id}
    elif action == "leave_game":
        opp_id = [pid for pid in engine.players if pid != player_id][0]
        engine.winner = opp_id
        engine.phase = GamePhase.GAME_OVER
        result = {"event": "surrender", "winner": opp_id, "reason": "leave"}
    else:
        await manager.send_game(game_id, player_id, {"event": "error", "message": f"Unknown: {action}"})
        return

    if "error" in result:
        await manager.send_game(game_id, player_id, {"event": "error", "message": result["error"]})
        return

    await manager.send_game(game_id, player_id, {"event": "action_result", "action": action, "result": result})

    opp_ids = [pid for pid in engine.players if pid != player_id]
    if opp_ids:
      safe = {k: v for k, v in result.items() if k != "hand"}
      opponent_payload = {"event": "opponent_action", "action": action, "result": safe}

      # 상대 클라이언트가 announcer에서 정확한 영웅 이미지를 고를 수 있도록
      # action 입력 메타(caster_uid/skill_key 등)를 함께 전달한다.
      if action == "use_skill":
          opponent_payload["caster_uid"] = data.get("caster_uid")
          opponent_payload["skill_key"] = data.get("skill_key")
      elif action == "execute_spell":
          opponent_payload["hero_key"] = data.get("hero_key")

      await manager.send_game(game_id, opp_ids[0], opponent_payload)

    await manager.broadcast_spectators(game_id, {
        "event": "game_action", "player_id": player_id,
        "action": action, "spectator_state": engine.get_spectator_state(),
    })

    if action in ("mulligan", "skip_mulligan", "end_placement", "end_turn", "surrender", "place_card", "use_skill", "basic_attack", "execute_spell", "resolve_passive_choice"):
        for pid in engine.players:
            await _send_state(game_id, pid, engine)

    if engine.phase == GamePhase.GAME_OVER:
        await _handle_game_over(game_id, engine)


async def _send_state(game_id: str, player_id: int, engine: GameEngine):
    await manager.send_game(game_id, player_id, {"event": "game_state", "state": engine.get_state(player_id)})


async def _handle_game_over(game_id: str, engine: GameEngine):
    winner_id = engine.winner
    loser_id = [pid for pid in engine.players if pid != winner_id][0] if winner_id else None

    for pid in list(engine.players):
        _cancel_disconnect_task(game_id, pid)

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

    await room_manager.close_room_by_game_id(game_id)
    active_games.pop(game_id, None)
    manager.cleanup_game(game_id)


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
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_spectator(game_id, ws)
        
        
# ── 매칭/방에서 호출하는 헬퍼 ─────────────────

async def create_game_from_match(match_data: dict) -> str:
    game_id = match_data["game_id"]
    await get_or_create_game(game_id, match_data["player1"], match_data["player2"])
    return game_id
