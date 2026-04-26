import { getApiBase } from '../../api/ws';
import type { GameState } from '../../types/game';
import { readGameError } from '../shared/gameErrorPolicy';
import type { SoloSide, SoloTransport } from './types';

export function createSoloHttpTransport(apiBase = getApiBase()): SoloTransport {
  return {
    async start(playerId: number) {
      const res = await fetch(`${apiBase}/solo/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      });
      if (!res.ok) throw new Error(await readGameError(res, '솔로 모드 시작 실패'));
      const body = await res.json();
      return {
        soloGameId: body.solo_game_id as string,
        state: body.state as GameState,
      };
    },

    async refresh(gameId: string, side: SoloSide) {
      const res = await fetch(`${apiBase}/solo/${gameId}/state?side=${side}`);
      if (!res.ok) throw new Error(await readGameError(res, '상태 갱신 실패'));
      const body = await res.json();
      return body.state as GameState;
    },

    async act(gameId: string, side: SoloSide, payload: Record<string, unknown>) {
      const res = await fetch(`${apiBase}/solo/${gameId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, payload }),
      });
      if (!res.ok) throw new Error(await readGameError(res, '행동 실패'));
      const body = await res.json();
      return {
        state: body.state as GameState,
        result: body?.result || {},
        activeSide: body.active_side as SoloSide | undefined,
      };
    },
  };
}
