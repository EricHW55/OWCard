import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getApiBase } from '../api/ws';
import './AdminPage.css';

type CardTemplate = {
    id: number;
    hero_key: string;
    name: string;
    role: string;
    description: string;
    hp: number;
    cost: number;
    base_attack: number;
    base_defense: number;
    base_attack_range: number;
    skill_damages: Record<string, unknown>;
    skill_meta: Record<string, unknown>;
    extra: Record<string, unknown>;
    is_spell: boolean;
};

type SkillEditorRow = {
    key: string;
    name: string;
    cooldown: string;
    description: string;
    damageText: string;
    extraText: string;
};

const SKILL_KEY_REGEX = /^(passive|skill_\d+(?:_.+)?)$/;

const normalizeObject = (value: unknown): Record<string, unknown> => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
);

const parseJsonOrFallback = (text: string, fallback: unknown) => {
    try {
        return JSON.parse(text || 'null');
    } catch {
        return fallback;
    }
};

const getSlotLabel = (skillKey: string) => {
    if (skillKey === 'passive') return 'Passive';
    if (skillKey.startsWith('skill_')) return skillKey.replace('skill_', 'Skill ');
    return skillKey;
};

const AdminPage: React.FC = () => {
    const [cards, setCards] = useState<CardTemplate[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
    const [isDbRawView, setIsDbRawView] = useState(false);

    const [description, setDescription] = useState('');
    const [hp, setHp] = useState(0);
    const [cost, setCost] = useState(1);
    const [baseAttack, setBaseAttack] = useState(0);
    const [baseDefense, setBaseDefense] = useState(0);
    const [baseAttackRange, setBaseAttackRange] = useState(1);
    const [skillDamagesText, setSkillDamagesText] = useState('{}');
    const [skillMetaText, setSkillMetaText] = useState('{}');
    const [extraText, setExtraText] = useState('{}');

    const [skillRows, setSkillRows] = useState<SkillEditorRow[]>([]);
    const [globalExtraText, setGlobalExtraText] = useState('{}');

    const token = sessionStorage.getItem('access_token') || '';
    const isAdmin = sessionStorage.getItem('is_admin') === 'true';

    const selectedCard = useMemo(
        () => cards.find((card) => card.id === selectedId) ?? null,
        [cards, selectedId],
    );

    useEffect(() => {
        if (!isAdmin || !token) return;

        const fetchCards = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await fetch(`${getApiBase()}/admin/cards`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                if (!res.ok) {
                    const payload = await res.json().catch(() => ({}));
                    throw new Error(payload.detail || '관리자 카드 정보를 불러오지 못했습니다.');
                }
                const data = await res.json();
                const list = Array.isArray(data) ? data : [];
                setCards(list);
                setSelectedId(list[0]?.id ?? null);
            } catch (e: any) {
                setError(e.message || '관리자 카드 정보를 불러오지 못했습니다.');
            } finally {
                setLoading(false);
            }
        };

        void fetchCards();
    }, [isAdmin, token]);

    useEffect(() => {
        if (!selectedCard) return;
        setDescription(selectedCard.description ?? '');
        setHp(selectedCard.hp ?? 0);
        setCost(selectedCard.cost ?? 1);
        setBaseAttack(selectedCard.base_attack ?? 0);
        setBaseDefense(selectedCard.base_defense ?? 0);
        setBaseAttackRange(selectedCard.base_attack_range ?? 1);
        setSkillDamagesText(JSON.stringify(selectedCard.skill_damages ?? {}, null, 2));
        setSkillMetaText(JSON.stringify(selectedCard.skill_meta ?? {}, null, 2));
        setExtraText(JSON.stringify(selectedCard.extra ?? {}, null, 2));

        const skillDamages = normalizeObject(selectedCard.skill_damages);
        const skillMeta = normalizeObject(selectedCard.skill_meta);
        const extra = normalizeObject(selectedCard.extra);

        const skillKeys = new Set<string>([
            ...Object.keys(skillDamages).filter((key) => SKILL_KEY_REGEX.test(key)),
            ...Object.keys(skillMeta).filter((key) => SKILL_KEY_REGEX.test(key)),
            ...Object.keys(extra).filter((key) => SKILL_KEY_REGEX.test(key)),
        ]);

        const orderedSkillKeys = Array.from(skillKeys).sort((a, b) => {
            if (a === 'passive') return -1;
            if (b === 'passive') return 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

        const nextRows: SkillEditorRow[] = orderedSkillKeys.map((key) => {
            const rawMeta = normalizeObject(skillMeta[key]);
            const rowExtra = extra[key];
            return {
                key,
                name: String(rawMeta.name ?? ''),
                cooldown: rawMeta.cooldown === undefined || rawMeta.cooldown === null ? '' : String(rawMeta.cooldown),
                description: String(rawMeta.description ?? ''),
                damageText: JSON.stringify(skillDamages[key] ?? null, null, 2),
                extraText: JSON.stringify(rowExtra ?? {}, null, 2),
            };
        });

        const globalExtra = Object.fromEntries(
            Object.entries(extra).filter(([key]) => !SKILL_KEY_REGEX.test(key)),
        );

        setSkillRows(nextRows);
        setGlobalExtraText(JSON.stringify(globalExtra, null, 2));
    }, [selectedCard]);

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const updateSkillRow = (index: number, patch: Partial<SkillEditorRow>) => {
        setSkillRows((prev) => prev.map((row, rowIdx) => (rowIdx === index ? { ...row, ...patch } : row)));
    };

    const handleSave = async () => {
        if (!selectedCard) return;
        setSaving(true);
        setError('');
        setNotice('');

        try {
            let payload: Record<string, unknown>;

            if (isDbRawView) {
                payload = {
                    description,
                    hp: Number(hp),
                    cost: Number(cost),
                    base_attack: Number(baseAttack),
                    base_defense: Number(baseDefense),
                    base_attack_range: Number(baseAttackRange),
                    skill_damages: parseJsonOrFallback(skillDamagesText, {}),
                    skill_meta: parseJsonOrFallback(skillMetaText, {}),
                    extra: parseJsonOrFallback(extraText, {}),
                };
            } else {
                const skill_damages = skillRows.reduce<Record<string, unknown>>((acc, row) => {
                    if (!row.damageText.trim()) return acc;
                    acc[row.key] = parseJsonOrFallback(row.damageText, null);
                    return acc;
                }, {});

                const skill_meta = skillRows.reduce<Record<string, unknown>>((acc, row) => {
                    const nextMeta: Record<string, unknown> = {};
                    if (row.name.trim()) nextMeta.name = row.name.trim();
                    if (row.cooldown.trim()) nextMeta.cooldown = Number(row.cooldown);
                    if (row.description.trim()) nextMeta.description = row.description.trim();
                    acc[row.key] = nextMeta;
                    return acc;
                }, {});

                const globalExtra = normalizeObject(parseJsonOrFallback(globalExtraText, {}));
                const skillScopedExtra = skillRows.reduce<Record<string, unknown>>((acc, row) => {
                    const parsed = parseJsonOrFallback(row.extraText, {});
                    const isEmptyObject = typeof parsed === 'object' && parsed && !Array.isArray(parsed) && Object.keys(parsed as Record<string, unknown>).length === 0;
                    if (parsed !== null && parsed !== undefined && !isEmptyObject) {
                        acc[row.key] = parsed;
                    }
                    return acc;
                }, {});

                payload = {
                    hp: Number(hp),
                    cost: Number(cost),
                    base_attack_range: Number(baseAttackRange),
                    skill_damages,
                    skill_meta,
                    extra: {
                        ...globalExtra,
                        ...skillScopedExtra,
                    },
                };
            }

            const res = await fetch(`${getApiBase()}/admin/cards/${selectedCard.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || '저장 실패');
            }

            const updated = await res.json();
            setCards((prev) => prev.map((card) => (card.id === updated.id ? updated : card)));
            setNotice(`${updated.name} 저장 완료`);
        } catch (e: any) {
            setError(e.message || '저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="admin-page">
            <aside className={`admin-sidebar ${isMobileDrawerOpen ? 'open' : ''}`}>
                <div className="admin-mobile-drawer-header">
                    <h2>카드 목록</h2>
                    <button type="button" onClick={() => setIsMobileDrawerOpen(false)}>닫기</button>
                </div>

                <h2>관리자 카드 편집</h2>
                {loading && <div className="admin-muted">불러오는 중...</div>}
                {error && <div className="admin-error">{error}</div>}
                <div className="admin-card-list">
                    {cards.map((card) => (
                        <button
                            key={card.id}
                            className={`admin-card-item ${selectedId === card.id ? 'active' : ''}`}
                            onClick={() => {
                                setSelectedId(card.id);
                                setIsMobileDrawerOpen(false);
                            }}
                        >
                            <img
                                src={`/heroes/${card.hero_key}.png`}
                                alt={card.name}
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = '/heroes/_unknown.png';
                                }}
                            />
                            <div>
                                <div>{card.name}</div>
                                <small>{card.is_spell ? '스킬' : card.role} · #{card.id}</small>
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            <main className="admin-main">
                <button
                    type="button"
                    className="admin-mobile-drawer-toggle"
                    onClick={() => setIsMobileDrawerOpen(true)}
                    aria-label="카드 목록 열기"
                >
                    ☰
                </button>

                {!selectedCard ? (
                    <div className="admin-muted">수정할 영웅/스킬 카드를 선택해주세요.</div>
                ) : (
                    <>
                        <div className="admin-header-row">
                            <h3>{selectedCard.name} ({selectedCard.hero_key})</h3>
                            <label className="admin-view-switch">
                                <input
                                    type="checkbox"
                                    checked={isDbRawView}
                                    onChange={(e) => setIsDbRawView(e.target.checked)}
                                />
                                <span>{isDbRawView ? '데이터베이스 값 그대로 보기' : '스킬 단위 보기'}</span>
                            </label>
                        </div>

                        {!isDbRawView ? (
                            <>
                                <div className="admin-grid compact">
                                    <label>HP
                                        <input type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} />
                                    </label>
                                    <label>비용
                                        <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
                                    </label>
                                    <label>기본 사거리
                                        <input type="number" value={baseAttackRange} onChange={(e) => setBaseAttackRange(Number(e.target.value))} />
                                    </label>
                                </div>

                                <section className="admin-skills-section">
                                    <div className="admin-section-head">
                                        <h4>스킬 속성</h4>
                                        <span>스킬 데미지 · 스킬 메타 · 추가 데이터를 스킬 단위로 편집</span>
                                    </div>

                                    <div className="admin-skill-list">
                                        {skillRows.map((row, index) => (
                                            <article key={row.key} className="admin-skill-card">
                                                <header>
                                                    <h5>{row.name || getSlotLabel(row.key)}</h5>
                                                    <small>{row.key} ({getSlotLabel(row.key)})</small>
                                                </header>
                                                <div className="admin-skill-grid">
                                                    <label>이름
                                                        <input
                                                            value={row.name}
                                                            onChange={(e) => updateSkillRow(index, { name: e.target.value })}
                                                            placeholder="스킬 이름"
                                                        />
                                                    </label>
                                                    <label>쿨다운
                                                        <input
                                                            type="number"
                                                            value={row.cooldown}
                                                            onChange={(e) => updateSkillRow(index, { cooldown: e.target.value })}
                                                            placeholder="0"
                                                        />
                                                    </label>
                                                    <label className="admin-span-2">설명
                                                        <textarea
                                                            value={row.description}
                                                            onChange={(e) => updateSkillRow(index, { description: e.target.value })}
                                                            rows={3}
                                                            placeholder="스킬 설명"
                                                        />
                                                    </label>
                                                    <label>스킬 데미지(JSON)
                                                        <textarea
                                                            value={row.damageText}
                                                            onChange={(e) => updateSkillRow(index, { damageText: e.target.value })}
                                                            rows={4}
                                                        />
                                                    </label>
                                                    <label>추가 데이터(JSON)
                                                        <textarea
                                                            value={row.extraText}
                                                            onChange={(e) => updateSkillRow(index, { extraText: e.target.value })}
                                                            rows={4}
                                                        />
                                                    </label>
                                                </div>
                                            </article>
                                        ))}
                                    </div>

                                    <label className="admin-global-extra">공통 추가 데이터(JSON)
                                        <textarea
                                            value={globalExtraText}
                                            onChange={(e) => setGlobalExtraText(e.target.value)}
                                            rows={5}
                                        />
                                    </label>
                                </section>
                            </>
                        ) : (
                            <>
                                <div className="admin-grid">
                                    <label>설명
                                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                                    </label>
                                    <label>HP
                                        <input type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} />
                                    </label>
                                    <label>비용
                                        <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
                                    </label>
                                    <label>기본 공격
                                        <input type="number" value={baseAttack} onChange={(e) => setBaseAttack(Number(e.target.value))} />
                                    </label>
                                    <label>기본 방어
                                        <input type="number" value={baseDefense} onChange={(e) => setBaseDefense(Number(e.target.value))} />
                                    </label>
                                    <label>기본 사거리
                                        <input type="number" value={baseAttackRange} onChange={(e) => setBaseAttackRange(Number(e.target.value))} />
                                    </label>
                                </div>

                                <div className="admin-json-wrap">
                                    <label>스킬 데미지(JSON)
                                        <textarea value={skillDamagesText} onChange={(e) => setSkillDamagesText(e.target.value)} rows={8} />
                                    </label>
                                    <label>스킬 메타(JSON)
                                        <textarea value={skillMetaText} onChange={(e) => setSkillMetaText(e.target.value)} rows={8} />
                                    </label>
                                    <label>추가 데이터(JSON)
                                        <textarea value={extraText} onChange={(e) => setExtraText(e.target.value)} rows={8} />
                                    </label>
                                </div>
                            </>
                        )}

                        <div className="admin-actions">
                            <button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장하기'}</button>
                            {notice && <span className="admin-success">{notice}</span>}
                        </div>
                    </>
                )}
            </main>

            {isMobileDrawerOpen && <div className="admin-mobile-drawer-dim" onClick={() => setIsMobileDrawerOpen(false)} aria-hidden />}
        </div>
    );
};

export default AdminPage;