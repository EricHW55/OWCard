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
from dataclasses import dataclass, field as dc_field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select

from database import async_session
from models.card import CardTemplate
from models.deck import Deck
from game_engine.engine import GameEngine, GamePhase
from config import DECK_SIZE, BO3_MAX_DECK_EDITS_PER_BREAK
from services.ws_manager import manager
from services.room_manager import room_manager
from services.matchmaking import matchmaking
from routers.auth import verify_token

router = APIRouter()

active_games: dict[str, GameEngine] = {}
@dataclass
class Bo3Session:
    player_ids: list[int]
    wins: dict[int, int] = dc_field(default_factory=dict)
    current_round: int = 1
    max_wins: int = 2
    max_rounds: int = 3
    deck_template_ids_by_player: dict[int, list[int]] = dc_field(default_factory=dict)
    pending_round_result: dict | None = None
    awaiting_deck_submit: set[int] = dc_field(default_factory=set)
    awaiting_first_player_choice: bool = False
    first_player_choice_player_id: int | None = None
    chosen_first_player_id: int | None = None


bo3_sessions: dict[str, Bo3Session] = {}
RECONNECT_GRACE = 30
_disconnect_tasks: dict[tuple[str, int], asyncio.Task] = {}
_timer_tasks: dict[str, asyncio.Task] = {}


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


async def load_deck_template_ids(deck_id: int) -> list[int]:
    async with async_session() as db:
        result = await db.execute(select(Deck).where(Deck.id == deck_id))
        deck = result.scalar_one_or_none()
        if not deck:
            return []
        template_ids: list[int] = []
        for dc in deck.cards:
            template_ids.extend([int(dc.card_template_id)] * int(dc.quantity))
        return template_ids


async def load_cards_from_template_ids(template_ids: list[int]) -> list[dict]:
    cards: list[dict] = []
    if not template_ids:
        return cards
    async with async_session() as db:
        for template_id in template_ids:
            tmpl = await db.execute(select(CardTemplate).where(CardTemplate.id == int(template_id)))
            t = tmpl.scalar_one_or_none()
            if t:
                cards.append(t.to_game_dict())
    return cards


async def get_or_create_game(game_id: str, p1: dict, p2: dict) -> GameEngine:
    if game_id in active_games:
        return active_games[game_id]
    engine = GameEngine(game_id)
    engine.add_player(p1["id"], p1["username"], await load_deck_cards(p1["deck_id"]))
    engine.add_player(p2["id"], p2["username"], await load_deck_cards(p2["deck_id"]))
    active_games[game_id] = engine
    _timer_tasks[game_id] = asyncio.create_task(_clock_monitor(game_id))
    return engine


async def initialize_bo3_session(game_id: str, p1: dict, p2: dict):
    p1_templates = await load_deck_template_ids(p1["deck_id"])
    p2_templates = await load_deck_template_ids(p2["deck_id"])
    bo3_sessions[game_id] = Bo3Session(
        player_ids=[int(p1["id"]), int(p2["id"])],
        wins={int(p1["id"]): 0, int(p2["id"]): 0},
        deck_template_ids_by_player={
            int(p1["id"]): p1_templates,
            int(p2["id"]): p2_templates,
        },
    )


def build_bo3_payload(game_id: str, player_id: int) -> dict | None:
    session = bo3_sessions.get(game_id)
    if not session:
        return None
    wins = {str(pid): int(session.wins.get(pid, 0)) for pid in session.player_ids}
    return {
        "format": "bo3",
        "current_round": session.current_round,
        "wins": wins,
        "max_wins": session.max_wins,
        "max_rounds": session.max_rounds,
        "current_deck_template_ids": list(session.deck_template_ids_by_player.get(player_id, [])),
        "deck_edit_limit_per_break": BO3_MAX_DECK_EDITS_PER_BREAK,
        "awaiting_deck_submit": player_id in session.awaiting_deck_submit,
        "awaiting_first_player_choice": session.awaiting_first_player_choice and session.first_player_choice_player_id == player_id,
        "can_start_next_round": (not session.awaiting_deck_submit) and (not session.awaiting_first_player_choice) and bool(session.pending_round_result),
        "pending_round_result": session.pending_round_result,
    }


async def _start_next_bo3_round(game_id: str, old_engine: GameEngine):
    session = bo3_sessions.get(game_id)
    if not session:
        return

    if session.awaiting_deck_submit or session.awaiting_first_player_choice:
        return

    player_data: list[tuple[int, str, list[dict]]] = []
    for pid in session.player_ids:
        ps = old_engine.players.get(pid)
        if not ps:
            return
        template_ids = session.deck_template_ids_by_player.get(pid, [])
        cards = await load_cards_from_template_ids(template_ids)
        player_data.append((pid, ps.username, cards))

    engine = GameEngine(game_id)
    for pid, username, cards in player_data:
        if not engine.add_player(pid, username, cards):
            return
        engine.players[pid].connected = old_engine.players.get(pid).connected if old_engine.players.get(pid) else True

    if session.chosen_first_player_id in session.player_ids:
        engine.first_player_id = session.chosen_first_player_id
    engine.start_game()
    active_games[game_id] = engine

    session.pending_round_result = None
    session.awaiting_first_player_choice = False
    session.first_player_choice_player_id = None
    session.chosen_first_player_id = None

    await manager.broadcast_all(game_id, {"event": "bo3_round_started", "round": session.current_round})
    for pid in engine.players:
        await _send_state(game_id, pid, engine)


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


async def _clock_monitor(game_id: str):
    try:
        while True:
            await asyncio.sleep(0.25)
            engine = active_games.get(game_id)
            if not engine:
                return
            timed_out = engine.sync_turn_timer()
            if not timed_out:
                continue
            for pid in engine.players:
                await _send_state(game_id, pid, engine)
            await _handle_game_over(game_id, engine)
            return
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
                    "message": "다시 뽑기 시작! 최대 2장 교체 가능",
                })

        while True:
            data = await ws.receive_json()
            live_engine = active_games.get(game_id)
            if not live_engine:
                await manager.send_game(game_id, player_id, {"event": "error", "message": "게임이 종료되었습니다."})
                return
            await _handle_action(game_id, player_id, data, live_engine)

    except WebSocketDisconnect:
        live_engine = active_games.get(game_id) or engine
        if player_id in live_engine.players:
            live_engine.players[player_id].connected = False
        manager.disconnect_game(game_id, player_id)
        _cancel_disconnect_task(game_id, player_id)
        _disconnect_tasks[(game_id, player_id)] = asyncio.create_task(_delayed_forfeit(game_id, player_id))
        await manager.broadcast_spectators(game_id, {"event": "player_disconnected", "player_id": player_id})
    except Exception as e:
        print(f"[GAME_WS] unexpected error game={game_id} player={player_id}: {e}")
        live_engine = active_games.get(game_id) or engine
        if player_id in live_engine.players:
            live_engine.players[player_id].connected = False
        manager.disconnect_game(game_id, player_id)
        _cancel_disconnect_task(game_id, player_id)
        _disconnect_tasks[(game_id, player_id)] = asyncio.create_task(_delayed_forfeit(game_id, player_id))
        await manager.broadcast_spectators(game_id, {"event": "player_disconnected", "player_id": player_id})


async def _handle_action(game_id: str, player_id: int, data: dict, engine: GameEngine):
    if engine.sync_turn_timer():
        for pid in engine.players:
            await _send_state(game_id, pid, engine)
        await _handle_game_over(game_id, engine)
        return
    
    action = data.get("action", "")
    result: dict = {}

    pending = getattr(engine.players.get(player_id), "pending_passive", None)
    allowed_when_pending = {"get_state", "resolve_passive_choice", "surrender", "leave_game", "cleanup_game", "ping"}
    if pending and action not in allowed_when_pending:
        await manager.send_game(game_id, player_id, {"event": "error", "message": "패시브 선택을 먼저 완료하세요"})
        return

    bo3_session = bo3_sessions.get(game_id)
    if bo3_session and bo3_session.pending_round_result:
        between_round_allowed = {"get_state", "ping", "cleanup_game", "leave_game", "submit_bo3_deck", "bo3_choose_first"}
        if action not in between_round_allowed:
            await manager.send_game(game_id, player_id, {"event": "error", "message": "세트 사이 준비 단계입니다. 덱 제출/선후공 선택 후 진행됩니다."})
            return

    if action == "mulligan":
        result = engine.mulligan(player_id, data.get("card_indices", []))
    elif action == "skip_mulligan":
        result = engine.skip_mulligan(player_id)
    elif action == "place_card":
        result = engine.place_card(
            player_id,
            data.get("hand_index", 0),
            data.get("zone", "main"),
            data.get("slot_index"),
        )
    elif action == "end_placement":
        result = engine.end_placement(player_id)
    elif action == "basic_attack":
        result = engine.basic_attack(player_id, data.get("attacker_uid", ""), data.get("target_uid", ""))
    elif action == "use_skill":
        result = engine.use_skill(
            player_id,
            data.get("caster_uid", ""),
            data.get("skill_key", ""),
            data.get("target_uid"),
            target_zone=data.get("target_zone"),
            target_role=data.get("target_role"),
            target_slot_index=data.get("target_slot_index"),
        )
    elif action == "execute_spell":
        result = engine.execute_spell(
            player_id=player_id,
            hero_key=data.get("hero_key", ""),
            target_uid=data.get("target_uid"),
            trash_index=data.get("trash_index"),
            draw_index=data.get("draw_index"),
            zone=data.get("zone"),
        )
    elif action == "end_turn":
        result = engine.end_turn(player_id)
    elif action == "resolve_passive_choice":
        result = engine.resolve_passive_choice(
            player_id,
            trash_index=data.get("trash_index"),
            hand_index=data.get("hand_index"),
            zone=data.get("zone"),
            slot_index=data.get("slot_index"),
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
    elif action == "cleanup_game":
        await matchmaking.consume_recent_match_if_in_game(player_id)
        room = room_manager.find_room_by_game_id(game_id)
        await room_manager.close_room_by_game_id(game_id)
        if room:
            await manager.broadcast_lobby({"event": "room_closed", "room_code": room.room_code})
        await manager.send_game(game_id, player_id, {"event": "cleanup_ack"})
        return
    elif action == "submit_bo3_deck":
        if not bo3_session or not bo3_session.pending_round_result:
            await manager.send_game(game_id, player_id, {"event": "error", "message": "BO3 덱 제출 가능 상태가 아닙니다."})
            return
        raw_ids = data.get("deck_card_ids", [])
        if not isinstance(raw_ids, list):
            await manager.send_game(game_id, player_id, {"event": "error", "message": "deck_card_ids 형식이 올바르지 않습니다."})
            return
        try:
            submitted_ids = [int(v) for v in raw_ids]
        except Exception:
            await manager.send_game(game_id, player_id, {"event": "error", "message": "deck_card_ids 형식이 올바르지 않습니다."})
            return
        if len(submitted_ids) != DECK_SIZE:
            await manager.send_game(game_id, player_id, {"event": "error", "message": f"덱은 {DECK_SIZE}장이어야 합니다."})
            return
        prev_ids = bo3_session.deck_template_ids_by_player.get(player_id, [])
        before_count: dict[int, int] = {}
        after_count: dict[int, int] = {}
        for cid in prev_ids:
            before_count[int(cid)] = int(before_count.get(int(cid), 0)) + 1
        for cid in submitted_ids:
            after_count[int(cid)] = int(after_count.get(int(cid), 0)) + 1
        all_ids = set(before_count.keys()) | set(after_count.keys())
        removed_count = 0
        added_count = 0
        for cid in all_ids:
            before = int(before_count.get(cid, 0))
            after = int(after_count.get(cid, 0))
            if before > after:
                removed_count += before - after
            elif after > before:
                added_count += after - before
        if removed_count > BO3_MAX_DECK_EDITS_PER_BREAK or added_count > BO3_MAX_DECK_EDITS_PER_BREAK:
            await manager.send_game(
                game_id,
                player_id,
                {
                    "event": "error",
                    "message": f"이번 휴식 구간에서는 최대 {BO3_MAX_DECK_EDITS_PER_BREAK}장까지 덱을 변경할 수 있습니다.",
                },
            )
            return
        cards = await load_cards_from_template_ids(submitted_ids)
        if len(cards) != len(submitted_ids):
            await manager.send_game(game_id, player_id, {"event": "error", "message": "존재하지 않는 카드가 포함되어 있습니다."})
            return
        bo3_session.deck_template_ids_by_player[player_id] = submitted_ids
        bo3_session.awaiting_deck_submit.discard(player_id)
        await manager.send_game(game_id, player_id, {"event": "action_result", "action": action, "result": {"ok": True}})
        await _send_state(game_id, player_id, engine)
        opp_ids = [pid for pid in bo3_session.player_ids if pid != player_id]
        for opp_id in opp_ids:
            await _send_state(game_id, opp_id, engine)
        if not bo3_session.awaiting_deck_submit and not bo3_session.awaiting_first_player_choice:
            await _start_next_bo3_round(game_id, engine)
        return
    elif action == "bo3_choose_first":
        if not bo3_session or not bo3_session.pending_round_result or not bo3_session.awaiting_first_player_choice:
            await manager.send_game(game_id, player_id, {"event": "error", "message": "선후공 선택 가능 상태가 아닙니다."})
            return
        if bo3_session.first_player_choice_player_id != player_id:
            await manager.send_game(game_id, player_id, {"event": "error", "message": "이번 세트는 직전 세트 패자만 선후공을 선택할 수 있습니다."})
            return
        choice = str(data.get("choice", "first")).lower()
        winner_id = int(bo3_session.pending_round_result["winner"])
        loser_id = int(bo3_session.pending_round_result["loser"])
        bo3_session.chosen_first_player_id = winner_id if choice == "first" else loser_id
        bo3_session.awaiting_first_player_choice = False
        await manager.send_game(game_id, player_id, {"event": "action_result", "action": action, "result": {"ok": True, "choice": choice}})
        for pid in bo3_session.player_ids:
            await _send_state(game_id, pid, engine)
        if not bo3_session.awaiting_deck_submit:
            await _start_next_bo3_round(game_id, engine)
        return
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
    state = engine.get_state(player_id)
    bo3_payload = build_bo3_payload(game_id, player_id)
    if bo3_payload:
        state["bo3"] = bo3_payload
    await manager.send_game(game_id, player_id, {"event": "game_state", "state": state})


async def _handle_game_over(game_id: str, engine: GameEngine):
    winner_id = engine.winner
    loser_id = [pid for pid in engine.players if pid != winner_id][0] if winner_id else None
    player_ids = list(engine.players)
    bo3_session = bo3_sessions.get(game_id)

    for pid in player_ids:
        _cancel_disconnect_task(game_id, pid)

    if bo3_session and winner_id and loser_id:
        bo3_session.wins[winner_id] = int(bo3_session.wins.get(winner_id, 0)) + 1
        is_final = bo3_session.wins[winner_id] >= bo3_session.max_wins or bo3_session.current_round >= bo3_session.max_rounds
        if not is_final:
            bo3_session.pending_round_result = {
                "winner": winner_id,
                "loser": loser_id,
                "round": bo3_session.current_round,
                "wins": {str(pid): int(bo3_session.wins.get(pid, 0)) for pid in bo3_session.player_ids},
            }
            bo3_session.current_round += 1
            bo3_session.awaiting_deck_submit = set(bo3_session.player_ids)
            bo3_session.awaiting_first_player_choice = True
            bo3_session.first_player_choice_player_id = loser_id
            bo3_session.chosen_first_player_id = None

            await manager.broadcast_all(game_id, {"event": "bo3_round_end", "round": bo3_session.pending_round_result["round"], "winner": winner_id, "winner_name": engine.players[winner_id].username, "next_round": bo3_session.current_round})
            for pid in player_ids:
                await _send_state(game_id, pid, engine)
            return
        
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

    for pid in player_ids:
        await matchmaking.consume_recent_match_if_in_game(pid)

    room = room_manager.find_room_by_game_id(game_id)
    await room_manager.close_room_by_game_id(game_id)
    if room:
        await manager.broadcast_lobby({"event": "room_closed", "room_code": room.room_code})
    active_games.pop(game_id, None)
    bo3_sessions.pop(game_id, None)
    timer_task = _timer_tasks.pop(game_id, None)
    if timer_task and not timer_task.done():
        timer_task.cancel()
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
    if str(match_data.get("match_format", "bo1")).lower() == "bo3":
        await initialize_bo3_session(game_id, match_data["player1"], match_data["player2"])
    return game_id
