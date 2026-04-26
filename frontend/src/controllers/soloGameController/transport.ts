import { getApiBase } from '../../api/ws';
import type { GameState } from '../../types/game';
import { readGameError } from '../shared/gameErrorPolicy';
import type { SoloSide, SoloTransport } from './types';

function getSameOriginApiBase(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.origin.replace(/\/+$/, '');
}

async function fetchWithSameOriginFallback(input: string, init?: RequestInit): Promise<Response> {
  const fallbackBase = getSameOriginApiBase();
  const requestUrl = new URL(input, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');

  try {
    const res = await fetch(requestUrl.toString(), init);
    const canRetryWithFallback =
        !!fallbackBase
        && requestUrl.origin !== fallbackBase
        && [502, 503, 504].includes(res.status);

    if (!canRetryWithFallback) return res;
    const fallbackUrl = `${fallbackBase}${requestUrl.pathname}${requestUrl.search}`;
    return fetch(fallbackUrl, init);
  } catch (error) {
    const canRetryWithFallback = !!fallbackBase && requestUrl.origin !== fallbackBase;
    if (!canRetryWithFallback) throw error;
    const fallbackUrl = `${fallbackBase}${requestUrl.pathname}${requestUrl.search}`;
    return fetch(fallbackUrl, init);
  }
}

export function createSoloHttpTransport(apiBase = getApiBase()): SoloTransport {
  return {
    async start(playerId: number, options?: { bottomDeckId?: number | null; topDeckId?: number | null }) {
      const res = await fetchWithSameOriginFallback(`${apiBase}/solo/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: playerId,
          deck_id: options?.bottomDeckId ?? undefined,
          top_deck_id: options?.topDeckId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(await readGameError(res, '솔로 모드 시작 실패'));
      const body = await res.json();
      return {
        soloGameId: body.solo_game_id as string,
        state: body.state as GameState,
      };
    },

    async refresh(gameId: string, side: SoloSide) {
      const res = await fetchWithSameOriginFallback(`${apiBase}/solo/${gameId}/state?side=${side}`);
      if (!res.ok) throw new Error(await readGameError(res, '상태 갱신 실패'));
      const body = await res.json();
      return body.state as GameState;
    },

    async act(gameId: string, side: SoloSide, payload: Record<string, unknown>) {
      const res = await fetchWithSameOriginFallback(`${apiBase}/solo/${gameId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, payload }),
      });
      if (!res.ok) throw new Error(await readGameError(res, '행동 실패'));
      const body = await res.json();
      return {
        state: body.state as GameState,
        actingState: body.acting_state as GameState | undefined,
        result: body?.result || {},
        activeSide: body.active_side as SoloSide | undefined,
      };
    },
  };
}
