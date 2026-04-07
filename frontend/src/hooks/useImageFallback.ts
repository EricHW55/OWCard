import { useCallback, useEffect, useMemo, useState } from 'react';

export function useImageFallback(candidates: string[], resetKeys: ReadonlyArray<unknown> = []) {
    const normalizedCandidates = useMemo(
        () => Array.from(new Set(candidates.filter(Boolean))),
        [candidates]
    );
    const [imageStep, setImageStep] = useState(0);
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImageStep(0);
        setImgError(false);
    }, resetKeys);

    const currentImageSrc = normalizedCandidates[imageStep] || '';

    const onError = useCallback(() => {
        if (imageStep + 1 < normalizedCandidates.length) {
            setImageStep((prev) => prev + 1);
            return;
        }
        setImgError(true);
    }, [imageStep, normalizedCandidates.length]);

    return {
        imageStep,
        imgError,
        currentImageSrc,
        onError,
        hasCandidates: normalizedCandidates.length > 0,
        candidates: normalizedCandidates,
    };
}