import { useCallback, useRef, useState } from 'react';
import type { AnnouncerData } from '../components/GameAnnouncer';

export function useAnnouncerQueue() {
  const [announcerData, setAnnouncerData] = useState<AnnouncerData | null>(null);
  const queueRef = useRef<AnnouncerData[]>([]);

  const enqueueAnnouncer = useCallback((next: AnnouncerData) => {
    setAnnouncerData((prev) => {
      if (!prev) return next;
      queueRef.current.push(next);
      return prev;
    });
  }, []);

  const closeAnnouncer = useCallback(() => {
    setAnnouncerData(() => queueRef.current.shift() || null);
  }, []);

  return {
    announcerData,
    enqueueAnnouncer,
    closeAnnouncer,
  };
}

export default useAnnouncerQueue;
