import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FieldCardComp from '../components/FieldCardComp';
import type { FieldCard, StatusEffect } from '../types/game';
import '../styles/statusEffects/index.css';
import './StatusEffectsPage.css';

type HeroPreset = {
    hero_key: string;
    name: string;
    role: FieldCard['role'];
    max_hp: number;
    attack: number;
    attack_range: number;
    description: string;
};

type HeroOption = {
    hero_key: string;
    name: string;
    role: FieldCard['role'];
    iconSrc: string;
};

type EffectPreview = {
    key: string;
    label: string;
    title: string;
    summary: string;
    statuses: StatusEffect[];
    extra?: Record<string, any>;
};

const HERO_PRESETS: HeroPreset[] = [
    { hero_key: 'reinhardt', name: '라인하르트', role: 'tank', max_hp: 18, attack: 4, attack_range: 1, description: '전열 유지형 탱커' },
    { hero_key: 'zarya', name: '자리야', role: 'tank', max_hp: 15, attack: 4, attack_range: 1, description: '방벽/차징 탱커' },
    { hero_key: 'sojourn', name: '소전', role: 'dealer', max_hp: 11, attack: 4, attack_range: 2, description: '원거리 딜러' },
    { hero_key: 'sombra', name: '솜브라', role: 'dealer', max_hp: 10, attack: 3, attack_range: 2, description: '교란형 딜러' },
    { hero_key: 'ana', name: '아나', role: 'healer', max_hp: 9, attack: 2, attack_range: 3, description: '원거리 힐러' },
    { hero_key: 'mei', name: '메이', role: 'dealer', max_hp: 12, attack: 3, attack_range: 2, description: '빙결 특화 딜러' },
    { hero_key: 'orisa', name: '오리사', role: 'tank', max_hp: 17, attack: 3, attack_range: 2, description: '방어강화 탱커' },
    { hero_key: 'roadhog', name: '로드호그', role: 'tank', max_hp: 16, attack: 4, attack_range: 1, description: '근접 압박 탱커' },
];

const HERO_OPTIONS: HeroOption[] = [
    { hero_key: 'ana', name: '아나', role: 'healer', iconSrc: '/heroes/ana.png' },
    { hero_key: 'anran', name: '안란', role: 'dealer', iconSrc: '/heroes/anran.png' },
    { hero_key: 'ashe', name: '애쉬', role: 'dealer', iconSrc: '/heroes/ashe.png' },
    { hero_key: 'baptiste', name: '바티스트', role: 'healer', iconSrc: '/heroes/baptiste.png' },
    { hero_key: 'bastion', name: '바스티온', role: 'dealer', iconSrc: '/heroes/bastion.png' },
    { hero_key: 'brigitte', name: '브리기테', role: 'healer', iconSrc: '/heroes/brigitte.png' },
    { hero_key: 'cassidy', name: '캐서디', role: 'dealer', iconSrc: '/heroes/cassidy.png' },
    { hero_key: 'dva', name: 'D.Va', role: 'tank', iconSrc: '/heroes/dva.png' },
    { hero_key: 'doomfist', name: '둠피스트', role: 'tank', iconSrc: '/heroes/doomfist.png' },
    { hero_key: 'echo', name: '에코', role: 'dealer', iconSrc: '/heroes/echo.png' },
    { hero_key: 'genji', name: '겐지', role: 'dealer', iconSrc: '/heroes/genji.png' },
    { hero_key: 'hanzo', name: '한조', role: 'dealer', iconSrc: '/heroes/hanzo.png' },
    { hero_key: 'hazard', name: '해저드', role: 'tank', iconSrc: '/heroes/hazard.png' },
    { hero_key: 'illari', name: '일리아리', role: 'healer', iconSrc: '/heroes/illari.png' },
    { hero_key: 'junker_queen', name: '정커퀸', role: 'tank', iconSrc: '/heroes/junker_queen.png' },
    { hero_key: 'junkrat', name: '정크랫', role: 'dealer', iconSrc: '/heroes/junkrat.png' },
    { hero_key: 'kiriko', name: '키리코', role: 'healer', iconSrc: '/heroes/kiriko.png' },
    { hero_key: 'lifeweaver', name: '라이프위버', role: 'healer', iconSrc: '/heroes/lifeweaver.png' },
    { hero_key: 'lucio', name: '루시우', role: 'healer', iconSrc: '/heroes/lucio.png' },
    { hero_key: 'mauga', name: '마우가', role: 'tank', iconSrc: '/heroes/mauga.png' },
    { hero_key: 'mei', name: '메이', role: 'dealer', iconSrc: '/heroes/mei.png' },
    { hero_key: 'mercy', name: '메르시', role: 'healer', iconSrc: '/heroes/mercy.png' },
    { hero_key: 'moira', name: '모이라', role: 'healer', iconSrc: '/heroes/moira.png' },
    { hero_key: 'orisa', name: '오리사', role: 'tank', iconSrc: '/heroes/orisa.png' },
    { hero_key: 'pharah', name: '파라', role: 'dealer', iconSrc: '/heroes/pharah.png' },
    { hero_key: 'ramattra', name: '라마트라', role: 'tank', iconSrc: '/heroes/ramattra.png' },
    { hero_key: 'reaper', name: '리퍼', role: 'dealer', iconSrc: '/heroes/reaper.png' },
    { hero_key: 'reinhardt', name: '라인하르트', role: 'tank', iconSrc: '/heroes/reinhardt.png' },
    { hero_key: 'roadhog', name: '로드호그', role: 'tank', iconSrc: '/heroes/roadhog.png' },
    { hero_key: 'sigma', name: '시그마', role: 'tank', iconSrc: '/heroes/sigma.png' },
    { hero_key: 'sojourn', name: '소전', role: 'dealer', iconSrc: '/heroes/sojourn.png' },
    { hero_key: 'soldier_76', name: '솔저: 76', role: 'dealer', iconSrc: '/heroes/soldier_76.png' },
    { hero_key: 'sombra', name: '솜브라', role: 'dealer', iconSrc: '/heroes/sombra.png' },
    { hero_key: 'symmetra', name: '시메트라', role: 'dealer', iconSrc: '/heroes/symmetra.png' },
    { hero_key: 'torbjorn', name: '토르비욘', role: 'dealer', iconSrc: '/heroes/torbjorn.png' },
    { hero_key: 'tracer', name: '트레이서', role: 'dealer', iconSrc: '/heroes/tracer.png' },
    { hero_key: 'venture', name: '벤처', role: 'dealer', iconSrc: '/heroes/venture.png' },
    { hero_key: 'widowmaker', name: '위도우메이커', role: 'dealer', iconSrc: '/heroes/widowmaker.png' },
    { hero_key: 'winston', name: '윈스턴', role: 'tank', iconSrc: '/heroes/winston.png' },
    { hero_key: 'wrecking_ball', name: '레킹볼', role: 'tank', iconSrc: '/heroes/wrecking_ball.png' },
    { hero_key: 'wuyang', name: '우양', role: 'healer', iconSrc: '/heroes/wuyang.png' },
    { hero_key: 'zarya', name: '자리야', role: 'tank', iconSrc: '/heroes/zarya.png' },
    { hero_key: 'zenyatta', name: '젠야타', role: 'healer', iconSrc: '/heroes/zenyatta.png' },
];

const makeStatus = (
    name: string,
    duration: number,
    tags: string[] = [],
    overrides: Partial<StatusEffect> = {},
): StatusEffect => ({
    name,
    duration,
    source: 'status_effect_demo',
    visible: true,
    tags,
    ...overrides,
});

const EFFECTS: EffectPreview[] = [
    { key: 'barrier', label: 'Barrier', title: '방벽', summary: '별도 방벽 체력으로 피해를 흡수, 옵션에 따라 패싱 공격 차단 및 도발 부여 가능.', statuses: [makeStatus('barrier', 2, ['buff'], { barrier_hp: 8, barrier_max_hp: 8 })] },
    { key: 'particle_barrier', label: 'ParticleBarrier', title: '자리야 입자 방벽', summary: '첫 피격 1회 무효, 깨질 때 자리야 버프 트리거 가능.', statuses: [makeStatus('barrier', 1, ['buff'], { barrier_hp: 4, barrier_max_hp: 4 })], extra: { particle_barrier_charge: 1 } },
    { key: 'airborne', label: 'Airborne', title: '공중 상태', summary: '공격 시 거리 1칸 무시, 피격 시 더 쉽게 맞음.', statuses: [makeStatus('airborne', 2, ['buff'])] },
    { key: 'gravity_flux_airborne', label: 'GravityFluxAirborne', title: '중력붕괴 전용 공중 상태', summary: '공격 시 거리 1칸 무시, 피격 시 더 쉽게 맞음, 종료 시 피해는 엔진이 처리.', statuses: [makeStatus('gravity_flux_airborne', 1, ['debuff'])] },
    { key: 'stealth', label: 'Stealth', title: '은신', summary: '적용 시 회복, 타겟팅 불가.', statuses: [makeStatus('stealth', 2, ['buff'])] },
    { key: 'burrowed', label: 'Burrowed', title: '잠복', summary: '타겟팅 불가, 다음 공격 시 거리 1칸 무시.', statuses: [makeStatus('burrowed', 1, ['buff'])] },
    { key: 'exposed', label: 'Exposed', title: '무시', summary: '자신이 더 쉽게 맞고, 앞라인 차단 역할을 하지 못하게 됨.', statuses: [makeStatus('exposed', 2, ['debuff'])] },
    { key: 'knockback', label: 'Knockback', title: '넉백', summary: '사거리 -1 용도의 상태값.', statuses: [makeStatus('range_modifier', 1, ['debuff'], { value: -1 })] },
    { key: 'pulled', label: 'Pulled', title: '끌어당겨짐', summary: '공격자 기준 이 카드까지의 거리 감소.', statuses: [makeStatus('pulled', 1, ['debuff'])] },
    { key: 'hooked', label: 'Hooked', title: '갈고리', summary: '거의 모든 아군이 거리 무시 수준으로 이 대상을 노릴 수 있게 함.', statuses: [makeStatus('hooked', 1, ['debuff'])] },
    { key: 'attack_buff', label: 'AttackBuff', title: '공격력 증감', summary: '공격 전에 공격력 수치 보정.', statuses: [makeStatus('attack_buff', 2, ['buff'], { value: 2 })] },
    { key: 'damage_multiplier', label: 'DamageMultiplier', title: '피해 배율 증감', summary: '스킬 피해 배율을 조정.', statuses: [makeStatus('damage_multiplier', 2, ['buff'], { value: 1.3 })] },
    { key: 'range_modifier', label: 'RangeModifier', title: '사거리 증감', summary: '사거리 수치를 조정하는 상태값.', statuses: [makeStatus('range_modifier', 2, ['buff'], { value: 1 })] },
    { key: 'damage_reduction', label: 'DamageReduction', title: '피해 감소', summary: '받는 피해를 퍼센트만큼 감소.', statuses: [makeStatus('damage_reduction', 2, ['buff'], { value: 0.4 })] },
    { key: 'next_turn_start_damage_reduction', label: 'NextTurnStartDamageReduction', title: '다음 턴 시작 해제형 피해 감소', summary: '자신의 다음 턴 시작 시 사라지는 피해 감소.', statuses: [makeStatus('next_turn_start_damage_reduction', 2, ['buff'], { value: 0.3 })] },
    { key: 'heal_block', label: 'HealBlock', title: '힐 차단', summary: '회복을 받을 수 없게 함.', statuses: [makeStatus('heal_block', 2, ['debuff'])] },
    { key: 'heal_amplify', label: 'HealAmplify', title: '힐 증폭', summary: '받는 힐량에 고정 수치 추가.', statuses: [makeStatus('heal_amplify', 2, ['buff'], { value: 2 })] },
    { key: 'heal_multiplier', label: 'HealMultiplier', title: '힐 배율 증가', summary: '받는 힐량에 배율 적용.', statuses: [makeStatus('heal_multiplier', 2, ['buff'], { value: 1.3 })] },
    { key: 'discord_orb', label: 'DiscordOrb', title: '부조화', summary: '받는 피해 증가.', statuses: [makeStatus('discord_orb', 2, ['debuff'])] },
    { key: 'taunt', label: 'Taunt', title: '도발', summary: '이 카드를 우선 공격해야 함.', statuses: [makeStatus('taunt', 2, ['buff'])] },
    { key: 'skill_silence', label: 'SkillSilence', title: '스킬 봉쇄', summary: '스킬 사용 불가.', statuses: [makeStatus('skill_silence', 2, ['debuff'])] },
    { key: 'burn', label: 'Burn', title: '화상', summary: '턴 종료 시 지속 피해.', statuses: [makeStatus('burn', 2, ['debuff'])] },
    { key: 'sticky_bomb', label: 'StickyBomb', title: '점착폭탄', summary: '턴 종료 시 폭발 피해.', statuses: [makeStatus('sticky_bomb', 2, ['debuff'])] },
    { key: 'frozen_state', label: 'FrozenState', title: '빙결 상태', summary: '무적, 행동 불가, 타겟팅 불가, 앞라인 차단 해제, 조건에 따라 해동 또는 부활.', statuses: [makeStatus('frozen_state', 1, ['debuff'])] },
    { key: 'frozen_revive', label: 'FrozenRevive', title: '빙결 부활 패시브', summary: '최초 사망 시 HP 1로 빙결 상태가 되고 다음 턴 시작에 부활.', statuses: [makeStatus('frozen_revive', 999, ['buff'])] },
    { key: 'immortality', label: 'Immortality', title: '불사', summary: '치명 피해를 막고 HP 1로 생존.', statuses: [makeStatus('immortality', 2, ['buff'])] },
    { key: 'reflect', label: 'Reflect', title: '반사', summary: '치명 피해를 반사하고 1회 생존 보장.', statuses: [makeStatus('reflect', 2, ['buff'])] },
    { key: 'extra_hp', label: 'ExtraHP', title: '추가 체력', summary: '별도 추가 체력으로 피해를 먼저 흡수.', statuses: [makeStatus('extra_hp', 2, ['buff'], { extra_hp: 6 })] },
    { key: 'mech_destruction', label: 'MechDestruction', title: '메카 파괴', summary: '메카 상태로 죽으면 송하나 폼으로 전환하며 생존.', statuses: [makeStatus('mech_destruction', 999, ['buff'])] },
    { key: 'charging', label: 'Charging', title: '차징', summary: '단계별 충전 수치를 쌓아 관리.', statuses: [makeStatus('charging', 3, ['buff'])], extra: { charge_level: 3 } },
    { key: 'orisa_fortify_passive', label: 'OrisaFortifyPassive', title: '오리사 방어강화 패시브', summary: '체력 임계치 이하에서 디버프 정화, 상태이상 면역, 피해 감소 활성화.', statuses: [makeStatus('orisa_fortify_passive', 999, ['buff']), makeStatus('damage_reduction', 1, ['buff'], { value: 0.4 })] },
];

const StatusEffectsPage: React.FC = () => {
    const navigate = useNavigate();
    const [selectedHeroKey, setSelectedHeroKey] = useState(HERO_PRESETS[0].hero_key);
    const [selectedEffectKey, setSelectedEffectKey] = useState(EFFECTS[0].key);
    const [isHeroModalOpen, setIsHeroModalOpen] = useState(false);
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
    const [particleBarrierBreakSeq, setParticleBarrierBreakSeq] = useState(0);

    const selectedHero = useMemo(() => {
        const directPreset = HERO_PRESETS.find((hero) => hero.hero_key === selectedHeroKey);
        if (directPreset) return directPreset;
        const pickedOption = HERO_OPTIONS.find((hero) => hero.hero_key === selectedHeroKey) ?? HERO_OPTIONS[0];
        const roleDefaults = pickedOption.role === 'tank'
            ? { max_hp: 16, attack: 4, attack_range: 1, description: '전열 탱커' }
            : pickedOption.role === 'healer'
                ? { max_hp: 10, attack: 2, attack_range: 3, description: '지원형 힐러' }
                : { max_hp: 11, attack: 3, attack_range: 2, description: '공격형 딜러' };
        return {
            hero_key: pickedOption.hero_key,
            name: pickedOption.name,
            role: pickedOption.role,
            ...roleDefaults,
        };
    }, [selectedHeroKey]);

    const selectedHeroOption = useMemo(
        () => HERO_OPTIONS.find((hero) => hero.hero_key === selectedHero.hero_key) ?? HERO_OPTIONS[0],
        [selectedHero.hero_key],
    );

    const selectedEffect = useMemo(
        () => EFFECTS.find((effect) => effect.key === selectedEffectKey) ?? EFFECTS[0],
        [selectedEffectKey],
    );

    const previewCard = useMemo<FieldCard>(() => {
        const hpAfterEffect = selectedEffect.key === 'frozen_state' ? 1 : selectedHero.max_hp;
        const shouldShowParticleBarrierBreak = selectedEffect.key === 'particle_barrier';
        return {
            uid: `status-demo-${selectedHero.hero_key}`,
            template_id: 999001,
            hero_key: selectedHero.hero_key,
            name: selectedHero.name,
            role: selectedHero.role,
            description: selectedHero.description,
            max_hp: selectedHero.max_hp,
            current_hp: hpAfterEffect,
            attack: selectedHero.attack,
            defense: 0,
            attack_range: selectedHero.attack_range,
            zone: 'main',
            statuses: selectedEffect.statuses,
            skill_cooldowns: {},
            skill_damages: {},
            skill_meta: {},
            placed_this_turn: false,
            acted_this_turn: false,
            extra: {
                _hero_key: selectedHero.hero_key,
                ...(selectedEffect.extra ?? {}),
                ...(shouldShowParticleBarrierBreak ? { particle_barrier_break_seq: particleBarrierBreakSeq } : {}),
            },
        };
    }, [selectedHero, selectedEffect, particleBarrierBreakSeq]);

    const handleSelectEffect = (effectKey: string) => {
        setSelectedEffectKey(effectKey);
        if (effectKey === 'particle_barrier') {
            setParticleBarrierBreakSeq((prev) => prev + 1);
        }
        setIsMobileDrawerOpen(false);
    };

    return (
        <div className="status-effects-page">
            <div className="status-effects-shell">
                <aside className={`status-effects-left panel ${isMobileDrawerOpen ? 'open' : ''}`}>
                    <div className="status-effects-mobile-drawer-header">
                        <h2>상태 효과 목록</h2>
                        <button type="button" onClick={() => setIsMobileDrawerOpen(false)}>닫기</button>
                    </div>

                    <h1>상태 효과 정보</h1>
                    <p>
                        왼쪽에서 상태 효과를 선택하면 오른쪽 카드에서 UI와 효과 표현을 바로 확인할 수 있습니다.
                    </p>

                    <div className="status-effects-group">
                        <h2>상태 효과 목록</h2>
                        <div className="effects-list">
                            {EFFECTS.map((effect) => (
                                <button
                                    key={effect.key}
                                    type="button"
                                    className={effect.key === selectedEffect.key ? 'active' : ''}
                                    onClick={() => handleSelectEffect(effect.key)}
                                >
                                    <span>{effect.label}</span>
                                    <small>{effect.title}</small>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="status-effects-actions">
                        <button type="button" onClick={() => navigate('/')}>로비로 돌아가기</button>
                    </div>
                </aside>

                <section className="status-effects-right panel">
                    <button
                        type="button"
                        className="status-effects-mobile-drawer-toggle"
                        onClick={() => setIsMobileDrawerOpen(true)}
                        aria-label="상태 효과 목록 열기"
                    >
                        ☰
                    </button>

                    <div className="status-effects-preview-header">
                        <h2>{selectedEffect.label}</h2>
                        <p>{selectedEffect.title} · {selectedEffect.summary}</p>
                    </div>

                    <div className="status-effects-preview-stage">
                        <FieldCardComp card={previewCard} />
                    </div>
                    {selectedEffect.key === 'particle_barrier' && (
                        <div className="status-effects-card-selector">
                            <button
                                type="button"
                                className="hero-change-button"
                                onClick={() => setParticleBarrierBreakSeq((prev) => prev + 1)}
                            >
                                파괴 연출 다시 보기
                            </button>
                        </div>
                    )}

                    <div className="status-effects-card-selector">
                        <button type="button" className="hero-change-button" onClick={() => setIsHeroModalOpen(true)}>
                            카드 선택
                        </button>
                        <div className="hero-selected-chip">
                            <img src={selectedHeroOption.iconSrc} alt={selectedHero.name} />
                            <span>{selectedHero.name}</span>
                        </div>
                    </div>
                </section>
            </div>

            {isMobileDrawerOpen && <div className="status-effects-mobile-drawer-dim" onClick={() => setIsMobileDrawerOpen(false)} aria-hidden />}

            {isHeroModalOpen && (
                <div className="hero-modal-overlay" onClick={() => setIsHeroModalOpen(false)}>
                    <div className="hero-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="hero-modal-header">
                            <h3>영웅 선택</h3>
                            <button type="button" onClick={() => setIsHeroModalOpen(false)}>닫기</button>
                        </div>
                        <div className="hero-modal-grid">
                            {HERO_OPTIONS.map((hero) => (
                                <button
                                    key={hero.hero_key}
                                    type="button"
                                    className={hero.hero_key === selectedHero.hero_key ? 'active' : ''}
                                    onClick={() => {
                                        setSelectedHeroKey(hero.hero_key);
                                        setIsHeroModalOpen(false);
                                    }}
                                >
                                    <img src={hero.iconSrc} alt={hero.name} />
                                    <span>{hero.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatusEffectsPage;