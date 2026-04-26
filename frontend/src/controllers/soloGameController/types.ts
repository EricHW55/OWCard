import type { FieldState, GameState, HandCard } from '../../types/game';

export type SoloSide = 'top' | 'bottom';

export type SoloPlayerView = {
  hand: HandCard[];
  field: FieldState;
  drawPile: HandCard[];
  mulliganDone: boolean;
  placementUsed: number;
};

export type SoloPlayersView = Record<SoloSide, SoloPlayerView>;

export type SoloTransport = {
  start(playerId: number): Promise<{ soloGameId: string; state: GameState }>;
  refresh(gameId: string, side: SoloSide): Promise<GameState>;
  act(gameId: string, side: SoloSide, payload: Record<string, unknown>): Promise<{
    state: GameState;
    result: any;
    activeSide?: SoloSide;
  }>;
};
