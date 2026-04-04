import type { ReactNode } from 'react';
import type { AnnouncerData } from '../components/GameAnnouncer';
import type { CardVisualEffect, FieldCard, FieldState, HandCard, KillFeedItem } from '../types/game';

export type PlaceZone = 'main' | 'side';
export type PlaceSlotIndex = 0 | 1;

export interface FieldPaneConfig {
  field: FieldState;
  isOpponent: boolean;
  isMyTurn: boolean;
  phase: string;
  selectedUid: string | null;
  canActUids: string[];
  onCardClick: (card: FieldCard) => void;
  cardEffects?: Record<string, CardVisualEffect>;
  placingCard: HandCard | null;
  onPlaceClick: (zone: PlaceZone, slotIndex?: PlaceSlotIndex) => void;
  allowOpponentPlacement?: boolean;
}

export interface GameScreenProps {
  announcerData: AnnouncerData | null;
  onCloseAnnouncer: () => void;

  topbarLeft: ReactNode;
  topbarCenter?: ReactNode;
  topbarRight: ReactNode;

  banners?: ReactNode[];
  topField: FieldPaneConfig;
  bottomField: FieldPaneConfig;
  midlineDotActive?: boolean;

  contextPanel?: ReactNode;

  handCards: HandCard[];
  isHandSelected: (index: number) => boolean;
  onHandClick: (card: HandCard, index: number) => void;

  bottomMeta?: ReactNode;
  bottomActions?: ReactNode;

  logs?: string[];
  killFeed?: KillFeedItem[];
  onDismissKillFeedItem?: (id: string) => void;
  detailCard?: FieldCard | HandCard | null;
  onCloseDetail?: () => void;
}
