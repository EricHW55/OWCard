export interface DeckEditorCardLike {
    id: number;
    name: string;
    role: string;
    is_spell?: boolean;
}

export function getDeckCardAddLimitMessage(
    card: DeckEditorCardLike | undefined,
    currentQty: number,
    roleMaxCounts: Record<string, number>,
    spellCardMaxCopies: number
): string | null {
    if (!card) return '카드 정보를 찾을 수 없습니다.';

    if (card.is_spell && currentQty >= spellCardMaxCopies) {
        return `${card.name} 스킬 카드는 최대 ${spellCardMaxCopies}장까지 가능합니다.`;
    }

    const roleKey = card.is_spell ? 'spell' : card.role;
    const perCardLimit = roleMaxCounts[roleKey];
    if (!card.is_spell && typeof perCardLimit === 'number' && currentQty >= perCardLimit) {
        return `${card.name} 카드는 최대 ${perCardLimit}장까지 넣을 수 있습니다.`;
    }

    return null;
}