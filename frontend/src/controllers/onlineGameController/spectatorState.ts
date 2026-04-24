import type { GameState } from '../../types/game';

export function mapSpectatorStateToGameState(spectatorState: any): GameState | null {
  if (!spectatorState || typeof spectatorState !== 'object') return null;
  const playersObj = spectatorState.players || {};
  const players = Object.values(playersObj) as any[];
  if (players.length < 2) return null;
  const [p1, p2] = players;
  const p1Id = Number(p1?.player_id ?? 0);
  const p2Id = Number(p2?.player_id ?? 0);
  const currentPlayer = Number(spectatorState.current_player ?? 0);
  const timerByPlayer = spectatorState?.timer?.remaining_by_player || {};
  return {
    game_id: String(spectatorState.game_id || ''),
    phase: spectatorState.phase,
    turn: Number(spectatorState.turn ?? 0),
    round: Number(spectatorState.round ?? 0),
    current_player: Number.isFinite(currentPlayer) ? currentPlayer : null,
    coin_result: spectatorState.coin_result ?? null,
    first_player: spectatorState.first_player ?? null,
    is_my_turn: currentPlayer === p1Id,
    my_state: p1,
    opponent_state: p2,
    winner: spectatorState.winner ?? null,
    commander_skill_limit: Number(spectatorState.commander_skill_limit ?? 1),
    timer: {
      initial_seconds: spectatorState?.timer?.initial_seconds,
      increment_seconds: spectatorState?.timer?.increment_seconds,
      my_remaining_seconds: Number(timerByPlayer?.[p1Id] ?? 0),
      opponent_remaining_seconds: Number(timerByPlayer?.[p2Id] ?? 0),
    },
  } as GameState;
}
