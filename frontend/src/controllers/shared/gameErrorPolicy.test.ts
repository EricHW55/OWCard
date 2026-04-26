import { normalizeGameError } from './gameErrorPolicy';

describe('game error policy', () => {
  test('normalizes empty and non-string errors with a common fallback', () => {
    expect(normalizeGameError('')).toBe('요청 실패');
    expect(normalizeGameError(null)).toBe('요청 실패');
  });

  test('keeps meaningful server errors for all game modes', () => {
    expect(normalizeGameError('행동할 수 없습니다')).toBe('행동할 수 없습니다');
  });
});
