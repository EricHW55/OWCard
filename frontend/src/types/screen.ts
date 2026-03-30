import type { ReactNode } from 'react';
import type { AnnouncerData } from '../components/GameAnnouncer';
import type { FieldCard, FieldState, HandCard } from '../types/game';

export type PlaceZone = 'main' | 'side';

export interface FieldPaneConfig {
  field: FieldState;
  isOpponent: boolean;
  isMyTurn: boolean;
  phase: string;
  selectedUid: string | null;
  canActUids: string[];
  onCardClick: (card: FieldCard) => void;
  placingCard: HandCard | null;
  onPlaceClick: (zone: PlaceZone) => void;
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
  detailCard?: FieldCard | HandCard | null;
  onCloseDetail?: () => void;
}
