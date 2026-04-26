import { normalizeErrorMessage } from '../../utils/ui';

export const DEFAULT_ERROR_MESSAGE = '요청 실패';

export async function readGameError(res: Response, fallback = DEFAULT_ERROR_MESSAGE): Promise<string> {
  try {
    const body = await res.json();
    return normalizeGameError(body?.detail || body?.message || `${fallback} (${res.status})`);
  } catch {
    return normalizeGameError(`${fallback} (${res.status})`);
  }
}

export function normalizeGameError(message: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  const raw = typeof message === 'string' && message.trim() ? message : fallback;
  return normalizeErrorMessage(raw);
}
