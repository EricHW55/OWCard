"""
로비 WebSocket — 퀵매칭 알림, 방 이벤트 실시간 전달.
"""
from __future__ import annotations
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from services.ws_manager import manager
from services.matchmaking import matchmaking
from services.room_manager import room_manager
from routers.auth import verify_token
from routers.game_ws import create_game_from_match, active_games

router = APIRouter()


@router.websocket("/ws/lobby")
async def lobby_ws(
    ws: WebSocket,
    token: str = Query(...),
    player_id: int = Query(...),
    username: str = Query(...),
):
    try:
        payload = verify_token(token)
        if int(payload["sub"]) != player_id:
            await ws.close(code=4001)
            return
    except Exception:
        await ws.close(code=4001)
        return

    await manager.connect_lobby(player_id, ws)

    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action", "")

            if action == "join_queue":
                deck_id = data.get("deck_id")
                match_format = data.get("match_format", "bo1")
                if not deck_id:
                    await ws.send_json({"event": "error", "message": "deck_id required"})
                    continue

                result = await matchmaking.join_queue(player_id, username, deck_id, str(match_format))
                if result:
                    game_id = await create_game_from_match(result)
                    await matchmaking.record_recent_match({
                        **result,
                        "game_id": game_id,
                    })
                    for key in ("player1", "player2"):
                        pid = result[key]["id"]
                        opp_key = "player2" if key == "player1" else "player1"
                        await manager.send_lobby(pid, {
                            "event": "match_found",
                            "game_id": game_id,
                            "opponent": result[opp_key],
                            "match_format": result.get("match_format", "bo1"),
                        })
                else:
                    await ws.send_json({
                        "event": "queue_joined",
                        "queue_size": matchmaking.queue_size(str(match_format)),
                        "match_format": "bo3" if str(match_format).lower() == "bo3" else "bo1",
                    })

            elif action == "leave_queue":
                await matchmaking.leave_queue(player_id)
                await ws.send_json({"event": "queue_left"})

            elif action == "create_room":
                match_format = data.get("match_format", "bo1")
                stale_room_code = await room_manager.cleanup_stale_room_for_host(player_id, set(active_games.keys()))
                if stale_room_code:
                    await manager.broadcast_lobby({"event": "room_closed", "room_code": stale_room_code})
                try:
                    room = await room_manager.create_room(player_id, username, str(match_format))
                except ValueError as exc:
                    await ws.send_json({"event": "error", "message": str(exc)})
                    continue
                await ws.send_json({"event": "room_created", "room": room.to_dict()})

            elif action == "join_room":
                code = data.get("room_code", "")
                room = await room_manager.join_room(code, player_id, username)
                if room:
                    await ws.send_json({"event": "room_joined", "room": room.to_dict()})
                    await manager.send_lobby(room.host_id, {"event": "guest_joined", "room": room.to_dict()})
                else:
                    await ws.send_json({"event": "error", "message": "Room not found or full"})

            elif action == "set_deck":
                ok = await room_manager.set_deck(data.get("room_id", ""), player_id, data.get("deck_id"))
                await ws.send_json({"event": "deck_set" if ok else "error", "message": "" if ok else "Failed"})

            elif action == "delete_room":
                deleted_room = await room_manager.close_room_by_host(player_id)
                if deleted_room:
                    await manager.broadcast_lobby({"event": "room_closed", "room_code": deleted_room.room_code})
                    await ws.send_json({"event": "room_deleted", "room_code": deleted_room.room_code})
                else:
                    await ws.send_json({"event": "error", "message": "삭제 가능한 방이 없습니다."})

            elif action == "start_game":
                result = await room_manager.start_game(data.get("room_id", ""))
                if result:
                    room = room_manager.get_room(data.get("room_id", ""))
                    if not room:
                        await ws.send_json({"event": "error", "message": "Room not found"})
                        continue
                    try:
                        game_id = await create_game_from_match(result)
                    except Exception as exc:
                        await room_manager.close_room(room.room_id)
                        await manager.broadcast_lobby({"event": "room_closed", "room_code": room.room_code})
                        await ws.send_json({"event": "error", "message": f"Game start failed: {exc}"})
                        continue
                    for pid in (room.host_id, room.guest_id):
                        if pid is not None:
                            await manager.send_lobby(pid, {
                                "event": "game_starting",
                                "game_id": game_id,
                                "room": room.to_dict()
                            })
                    for sid in room.spectator_ids:
                        await manager.send_lobby(sid, {"event": "game_starting_spectate", "game_id": game_id})
                else:
                    await ws.send_json({"event": "error", "message": "Cannot start game"})

            elif action == "spectate":
                code = data.get("room_code", "")
                room = await room_manager.add_spectator(code, player_id)
                if room:
                    if not room.game_id or room.game_id not in active_games:
                        await room_manager.close_room(room.room_id)
                        await manager.broadcast_lobby({"event": "room_closed", "room_code": room.room_code})
                        await ws.send_json({"event": "error", "message": "이미 종료된 경기입니다."})
                        continue
                    await ws.send_json({"event": "spectating", "room": room.to_dict()})
                else:
                    await ws.send_json({"event": "error", "message": "Cannot spectate"})

    except WebSocketDisconnect:
        manager.disconnect_lobby(player_id, ws)
        await matchmaking.leave_queue(player_id)

        result = await room_manager.remove_player(player_id)
        if not result:
            return

        room = result["room"]
        event_type = result["type"]

        if event_type == "room_closed":
            if room.guest_id:
                await manager.send_lobby(room.guest_id, {"event": "room_closed", "room_code": room.room_code})
            for sid in room.spectator_ids:
                await manager.send_lobby(sid, {"event": "room_closed", "room_code": room.room_code})

        elif event_type == "guest_left":
            await manager.send_lobby(room.host_id, {"event": "room_updated", "room": room.to_dict()})
            for sid in room.spectator_ids:
                await manager.send_lobby(sid, {"event": "room_updated", "room": room.to_dict()})

        elif event_type == "spectator_left":
            await manager.send_lobby(room.host_id, {"event": "room_updated", "room": room.to_dict()})
            if room.guest_id:
                await manager.send_lobby(room.guest_id, {"event": "room_updated", "room": room.to_dict()})