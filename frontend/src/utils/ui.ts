import type { CSSProperties } from 'react';
import { PHASE_LABEL } from '../types/constants';

export const BTN_SM: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  background: '#243055',
  border: '1px solid #3a4a78',
  color: '#e8ecf8',
  cursor: 'pointer',
};

export function phaseLabel(phase?: string) {
  if (!phase) return '진행 중';
  return (PHASE_LABEL as Record<string, string>)[phase] || phase;
}

export function phaseSubtitle(phase?: string, isMyTurn?: boolean) {
  switch (phase) {
    case 'mulligan':
      return '교체할 손패를 골라 주세요';
    case 'placement':
      return isMyTurn ? '카드를 필드에 배치할 차례' : '상대가 카드를 배치하는 중';
    case 'action':
      return isMyTurn ? '스킬을 선택해 전투를 이어가세요' : '상대 행동 진행 중';
    case 'game_over':
      return '전투 종료';
    default:
      return isMyTurn ? '내 차례' : '상대 차례';
  }
}

export function roleLabel(role?: string) {
  switch (role) {
    case 'tank': return '탱커';
    case 'dealer': return '딜러';
    case 'healer': return '힐러';
    case 'spell': return '스킬';
    default: return role || '미상';
  }
}

export function roleClass(role?: string) {
  switch (role) {
    case 'tank': return 'tank';
    case 'dealer': return 'dealer';
    case 'healer': return 'healer';
    case 'spell': return 'spell';
    default: return 'unknown';
  }
}

export function decodeJwt(token: string): any | null {
  try {
    return JSON.parse(window.atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function normalizeErrorMessage(raw: unknown): string {
  const message = String(raw || '').trim();
  if (!message) return '요청을 처리할 수 없습니다.';

  const lower = message.toLowerCase();
  if (lower.startsWith('placement full')) return '이번 턴 배치는 이미 2장을 모두 사용했습니다.';
  if (lower.includes('cannot place dealer') && lower.includes('side')) return '사이드 딜러 자리가 가득 차서 배치할 수 없습니다.';
  if (lower.includes('cannot place') && lower.includes('main')) return '본대 자리가 가득 차서 배치할 수 없습니다.';
  if (lower.includes('cannot place') && lower.includes('side')) return '사이드 자리가 가득 차서 배치할 수 없습니다.';

  return message;
}
