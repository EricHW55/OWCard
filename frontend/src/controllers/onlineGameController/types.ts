export type ColumnChoice = {
  source: 'skill' | 'spell';
  heroKey?: string;
  skillKey?: string;
  skillName: string;
  targetSide: 'my' | 'opponent';
};

export type KillSide = 'my' | 'opponent';
export type CoinFace = 'front' | 'back';

export type HeadshotCoinTossEvent = {
  id: number;
  actorName: string;
  skillName: string;
  heroKey: string;
  headshot: boolean;
  faces: [CoinFace, CoinFace];
  isMine: boolean;
};
