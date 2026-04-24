export type GameUiPreset = {
    timings: {
        placementCinematicMs: number;
        phaseChangeMs: number;
        systemNoticeMs: number;
        skillUseMs: number;
        spellTargetNoticeMs: number;
        spellChoiceNoticeMs: number;
        passiveNoticeMs: number;
    };
    skillOverlay: {
        revealDelayMs: number;
    };
};

export const ONLINE_GAME_UI_PRESET: GameUiPreset = {
    timings: {
        placementCinematicMs: 1220,
        phaseChangeMs: 1600,
        systemNoticeMs: 1300,
        skillUseMs: 3200,
        spellTargetNoticeMs: 1200,
        spellChoiceNoticeMs: 1300,
        passiveNoticeMs: 1300,
    },
    skillOverlay: {
        revealDelayMs: 620,
    },
};

export type SharedContextVisibilityParams = {
    phase: string;
    isMyTurn: boolean;
    mulliganVisible: boolean;
    hasFieldSkills: boolean;
    actionMode: string | null;
    pendingSpell: string | null;
    selectedHandSpell: boolean;
    hasColumnChoice: boolean;
    pendingPassiveType?: string | null;
    hasPendingSpellChoice: boolean;
};

export function shouldShowSharedContextPanel(params: SharedContextVisibilityParams): boolean {
    return params.mulliganVisible
        || params.hasFieldSkills
        || (!!params.actionMode && params.actionMode !== 'spell' && params.actionMode !== 'duplicate_place')
        || (params.actionMode === 'spell' && !!params.pendingSpell)
        || (params.actionMode === 'duplicate_place' && params.pendingSpell === 'spell_duplicate')
        || (params.phase === 'placement' && params.isMyTurn && params.selectedHandSpell && !params.pendingSpell)
        || params.hasColumnChoice
        || params.pendingPassiveType === 'mercy_resurrect'
        || params.pendingPassiveType === 'jetpack_cat_extra_place'
        || params.hasPendingSpellChoice;
}