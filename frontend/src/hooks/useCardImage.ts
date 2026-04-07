import { useMemo } from 'react';
import { useImageFallback } from './useImageFallback';
import { buildCardImageChain, type CardImageMode } from '../utils/heroImage';

interface CardLike {
    id?: string | number | null;
    uid?: string | number | null;
    hero_key?: string | number | null;
    name?: string | number | null;
    is_spell?: boolean;
    role?: 'tank' | 'dealer' | 'healer' | string | null;
}

export function useCardImage(
    card: CardLike,
    mode: CardImageMode,
    resetKeys: ReadonlyArray<unknown> = []
) {
    const fallbackChain = useMemo(() => buildCardImageChain(card, mode), [card, mode]);
    const { currentImageSrc, imgError, onError } = useImageFallback(fallbackChain, resetKeys);

    const usingFullCardArt = !imgError && !!currentImageSrc && currentImageSrc.startsWith('/illustration/');

    return {
        currentImageSrc,
        imgError,
        onError,
        usingFullCardArt,
    };
}