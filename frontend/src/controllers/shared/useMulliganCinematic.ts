import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandCard } from '../../types/game';

function pickReplacementCard(before: any[], after: any[]) {
  if (!after.length) return null;
  const countMap = new Map<string, number>();
  before.forEach((card: any) => {
    const key = `${card?.id}:${card?.name}:${card?.hero_key}`;
    countMap.set(key, (countMap.get(key) || 0) + 1);
  });
  for (const card of after) {
    const key = `${card?.id}:${card?.name}:${card?.hero_key}`;
    const left = countMap.get(key) || 0;
    if (left <= 0) return card;
    countMap.set(key, left - 1);
  }
  return after[0];
}

export function useMulliganCinematic(currentHand: HandCard[] | undefined) {
  const [mulliganAnimatingIndex, setMulliganAnimatingIndex] = useState<number | null>(null);
  const [mulliganCinematicCard, setMulliganCinematicCard] = useState<HandCard | null>(null);
  const [mulliganReplacementCard, setMulliganReplacementCard] = useState<HandCard | null>(null);
  const [isMulliganCinematicActive, setIsMulliganCinematicActive] = useState(false);
  const baselineHandRef = useRef<any[]>([]);
  const pendingReplacementRef = useRef(false);

  const beginMulliganCinematic = useCallback((index: number, card: HandCard, baselineHand: HandCard[]) => {
    baselineHandRef.current = [...baselineHand];
    pendingReplacementRef.current = true;
    setMulliganAnimatingIndex(index);
    setMulliganCinematicCard(card);
    setMulliganReplacementCard(null);
    setIsMulliganCinematicActive(true);
  }, []);

  const completeMulliganCinematic = useCallback(() => {
    setMulliganAnimatingIndex(null);
    setMulliganCinematicCard(null);
    setMulliganReplacementCard(null);
    pendingReplacementRef.current = false;
    setIsMulliganCinematicActive(false);
  }, []);

  useEffect(() => {
    if (!isMulliganCinematicActive || !pendingReplacementRef.current || !currentHand?.length) return;
    const replacement = pickReplacementCard(baselineHandRef.current, currentHand);
    if (!replacement) return;
    setMulliganReplacementCard(replacement);
    pendingReplacementRef.current = false;
  }, [currentHand, isMulliganCinematicActive]);

  return {
    mulliganAnimatingIndex,
    mulliganCinematicCard,
    mulliganReplacementCard,
    isMulliganCinematicActive,
    beginMulliganCinematic,
    completeMulliganCinematic,
  };
}
