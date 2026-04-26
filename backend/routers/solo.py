from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from database import async_session
from game_engine.engine import GameEngine
from models.deck import Deck, DeckCard
from models.card import CardTemplate
from models.player import Player

router = APIRouter(prefix='/solo', tags=['solo'])


@dataclass
class SoloSession:
    engine: GameEngine
    top_player_id: int
    bottom_player_id: int


class SoloStartRequest(BaseModel):
    player_id: int
    deck_id: int | None = None


class SoloActionRequest(BaseModel):
    side: str
    payload: dict[str, Any]


solo_sessions: dict[str, SoloSession] = {}


async def _load_deck_cards(deck_id: int) -> list[dict[str, Any]]:
    async with async_session() as db:
        result = await db.execute(
            select(Deck)
            .options(selectinload(Deck.cards))
            .where(Deck.id == deck_id)
        )
        deck = result.scalars().first()
        if not deck:
            raise HTTPException(status_code=404, detail='Deck not found')
        
        deck_card_rows = await db.execute(
            select(DeckCard, CardTemplate)
            .join(CardTemplate, CardTemplate.id == DeckCard.card_template_id)
            .where(DeckCard.deck_id == deck_id)
        )

        cards: list[dict[str, Any]] = []
        for deck_card, template in deck_card_rows.all():
            for _ in range(max(0, int(deck_card.quantity or 0))):
                cards.append(template.to_dict())

        if not cards:
            raise HTTPException(status_code=400, detail='Deck has no playable cards')
        return cards


@router.post('/start')
async def start_solo(req: SoloStartRequest):
    deck_id = req.deck_id
    if deck_id is None:
        async with async_session() as db:
            player_result = await db.execute(select(Player).where(Player.id == req.player_id))
            player = player_result.scalars().first()
            if not player:
                raise HTTPException(status_code=404, detail='Player not found')

            if player.selected_deck_id is not None:
                deck_result = await db.execute(
                    select(Deck).where(Deck.id == player.selected_deck_id, Deck.player_id == req.player_id)
                )
                deck = deck_result.scalars().first()
            else:
                deck = None

            if deck is None:
                fallback_result = await db.execute(
                    select(Deck).where(Deck.player_id == req.player_id).order_by(Deck.id.asc())
                )
                deck = fallback_result.scalars().first()
            if not deck:
                raise HTTPException(status_code=404, detail='Deck not found for player')
            deck_id = deck.id

    deck_cards = await _load_deck_cards(deck_id)

    game_id = f'solo_{uuid.uuid4().hex[:10]}'
    engine = GameEngine(game_id)
    bottom_id = req.player_id
    top_id = -abs(req.player_id) - 100000

    if not engine.add_player(bottom_id, 'Bottom Player', list(deck_cards)):
        raise HTTPException(status_code=400, detail='Failed to add bottom player')
    if not engine.add_player(top_id, 'Top Player', list(deck_cards)):
        raise HTTPException(status_code=400, detail='Failed to add top player')

    engine.start_game()
    # 솔로 핫시트 기본 UX: 아래쪽 선공 고정
    engine.current_turn_index = engine.player_order.index(bottom_id)
    engine.first_player_id = bottom_id
    engine.coin_result = 'heads'

    solo_sessions[game_id] = SoloSession(engine=engine, top_player_id=top_id, bottom_player_id=bottom_id)

    return {
        'solo_game_id': game_id,
        'top_player_id': top_id,
        'bottom_player_id': bottom_id,
        'state': engine.get_state(bottom_id),
    }


@router.get('/{solo_game_id}/state')
async def get_solo_state(solo_game_id: str, side: str = 'bottom'):
    session = solo_sessions.get(solo_game_id)
    if not session:
        raise HTTPException(status_code=404, detail='Solo game not found')

    viewer_id = session.bottom_player_id if side == 'bottom' else session.top_player_id
    return {'state': session.engine.get_state(viewer_id)}


@router.post('/{solo_game_id}/action')
async def act_solo(solo_game_id: str, req: SoloActionRequest):
    session = solo_sessions.get(solo_game_id)
    if not session:
        raise HTTPException(status_code=404, detail='Solo game not found')

    player_id = session.bottom_player_id if req.side == 'bottom' else session.top_player_id
    payload = req.payload or {}
    action = payload.get('action')
    engine = session.engine

    if action == 'mulligan':
        result = engine.mulligan(player_id, payload.get('card_indices', []))
    elif action == 'skip_mulligan':
        result = engine.skip_mulligan(player_id)
    elif action == 'place_card':
        result = engine.place_card(player_id, payload.get('hand_index', 0), payload.get('zone', 'main'), payload.get('slot_index'))
    elif action == 'end_placement':
        result = engine.end_placement(player_id)
    elif action == 'use_skill':
        result = engine.use_skill(
            player_id,
            payload.get('caster_uid', ''),
            payload.get('skill_key', ''),
            payload.get('target_uid'),
            target_zone=payload.get('target_zone'),
            target_role=payload.get('target_role'),
            target_slot_index=payload.get('target_slot_index'),
        )
    elif action == 'execute_spell':
        result = engine.execute_spell(
            player_id=player_id,
            hero_key=payload.get('hero_key', ''),
            target_uid=payload.get('target_uid'),
            trash_index=payload.get('trash_index'),
            draw_index=payload.get('draw_index'),
            zone=payload.get('zone'),
        )
    elif action == 'end_turn':
        result = engine.end_turn(player_id)
    elif action == 'resolve_passive_choice':
        result = engine.resolve_passive_choice(
            player_id,
            trash_index=payload.get('trash_index'),
            hand_index=payload.get('hand_index'),
            zone=payload.get('zone'),
            slot_index=payload.get('slot_index'),
            skip=bool(payload.get('skip', False)),
        )
    else:
        raise HTTPException(status_code=400, detail=f'Unsupported action: {action}')

    if isinstance(result, dict) and result.get('error'):
        raise HTTPException(status_code=400, detail=result['error'])

    active_side = 'bottom' if engine.current_player_id == session.bottom_player_id else 'top'
    active_id = session.bottom_player_id if active_side == 'bottom' else session.top_player_id

    return {
        'result': result,
        'active_side': active_side,
        'state': engine.get_state(active_id),
    }