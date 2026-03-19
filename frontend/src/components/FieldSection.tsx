import React from 'react';
import type { FieldState, FieldCard, HandCard as HandCardType } from '../types/game';
import { ROLE_COLOR } from '../types/constants';
import FieldCardComp from './FieldCardComp';

interface Props {
  field: FieldState;
  isOpponent: boolean;
  selectedUid: string | null;
  onCardClick: (card: FieldCard) => void;
  placingCard: HandCardType | null;
  onPlaceClick: (zone: 'main' | 'side') => void;
}

const EmptySlot: React.FC<{ label: string; highlight?: boolean; onClick?: () => void }> = ({ label, highlight, onClick }) => (
  <div onClick={onClick} style={{
    width: 62, height: 86, borderRadius: 6,
    border: `2px dashed ${highlight ? '#ff9b30' : '#2a3560'}`,
    background: highlight ? 'rgba(255,155,48,0.08)' : 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, color: '#5a6488', cursor: highlight ? 'pointer' : 'default', flexShrink: 0,
  }}>{label}</div>
);

const FieldSection: React.FC<Props> = ({ field, isOpponent, selectedUid, onCardClick, placingCard, onPlaceClick }) => {
  const tanks = (field?.main || []).filter(c => c.role === 'tank');
  const dealers = (field?.main || []).filter(c => c.role === 'dealer');
  const healers = (field?.main || []).filter(c => c.role === 'healer');
  const sideCards = field?.side || [];
  const canPlace = !!placingCard && !isOpponent;
  const placingRole = placingCard?.role;

  const renderRow = (cards: FieldCard[], role: string, max: number) => {
    const slots = [];
    for (let i = 0; i < max; i++) {
      if (i < cards.length) {
        slots.push(<FieldCardComp key={cards[i].uid} card={cards[i]} selected={selectedUid === cards[i].uid} onClick={() => onCardClick(cards[i])} />);
      } else if (canPlace && placingRole === role) {
        slots.push(<EmptySlot key={`e-${role}-${i}`} label="배치" highlight onClick={() => onPlaceClick('main')} />);
      } else {
        slots.push(<EmptySlot key={`e-${role}-${i}`} label="" />);
      }
    }
    return slots;
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ flex: 1, background: '#111832', borderRadius: 8, padding: '6px 8px', border: '1px solid #2a3560', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 9, color: '#5a6488', letterSpacing: 2, fontWeight: 700 }}>{isOpponent ? '상대 본대' : '나의 본대'}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: ROLE_COLOR.tank, width: 28, flexShrink: 0 }}>탱커</span>
          {renderRow(tanks, 'tank', 1)}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: ROLE_COLOR.dealer, width: 28, flexShrink: 0 }}>딜러</span>
          {renderRow(dealers, 'dealer', 2)}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 8, color: ROLE_COLOR.healer, width: 28, flexShrink: 0 }}>힐러</span>
          {renderRow(healers, 'healer', 2)}
        </div>
      </div>
      <div style={{ width: 84, background: '#111832', borderRadius: 8, padding: '6px 6px', border: '1px solid #2a3560', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <div style={{ fontSize: 9, color: '#5a6488', letterSpacing: 1, fontWeight: 700 }}>사이드</div>
        {sideCards.map(c => <FieldCardComp key={c.uid} card={c} selected={selectedUid === c.uid} onClick={() => onCardClick(c)} />)}
        {sideCards.length < 2 && canPlace && <EmptySlot label="배치" highlight onClick={() => onPlaceClick('side')} />}
        {sideCards.length === 0 && !canPlace && <EmptySlot label="" />}
      </div>
    </div>
  );
};

export default FieldSection;
