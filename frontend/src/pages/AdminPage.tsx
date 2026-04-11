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

const AdminPage: React.FC = () => {
    const [cards, setCards] = useState<CardTemplate[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [description, setDescription] = useState('');
    const [hp, setHp] = useState(0);
    const [cost, setCost] = useState(1);
    const [baseAttack, setBaseAttack] = useState(0);
    const [baseDefense, setBaseDefense] = useState(0);
    const [baseAttackRange, setBaseAttackRange] = useState(1);
    const [skillDamagesText, setSkillDamagesText] = useState('{}');
    const [skillMetaText, setSkillMetaText] = useState('{}');
    const [extraText, setExtraText] = useState('{}');

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
    }, [selectedCard]);

    if (!isAdmin) {
        return <Navigate to="/" replace />;
    }

    const handleSave = async () => {
        if (!selectedCard) return;
        setSaving(true);
        setError('');
        setNotice('');

        try {
            const skillDamages = JSON.parse(skillDamagesText || '{}');
            const skillMeta = JSON.parse(skillMetaText || '{}');
            const extra = JSON.parse(extraText || '{}');

            const payload = {
                description,
                hp: Number(hp),
                cost: Number(cost),
                base_attack: Number(baseAttack),
                base_defense: Number(baseDefense),
                base_attack_range: Number(baseAttackRange),
                skill_damages: skillDamages,
                skill_meta: skillMeta,
                extra,
            };

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
            <aside className="admin-sidebar">
                <h2>관리자 카드 편집</h2>
                {loading && <div className="admin-muted">불러오는 중...</div>}
                {error && <div className="admin-error">{error}</div>}
                <div className="admin-card-list">
                    {cards.map((card) => (
                        <button
                            key={card.id}
                            className={`admin-card-item ${selectedId === card.id ? 'active' : ''}`}
                            onClick={() => setSelectedId(card.id)}
                        >
                            <div>{card.name}</div>
                            <small>{card.is_spell ? '스킬' : card.role} · #{card.id}</small>
                        </button>
                    ))}
                </div>
            </aside>

            <main className="admin-main">
                {!selectedCard ? (
                    <div className="admin-muted">수정할 영웅/스킬 카드를 선택해주세요.</div>
                ) : (
                    <>
                        <h3>{selectedCard.name} ({selectedCard.hero_key})</h3>
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

                        <div className="admin-actions">
                            <button onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장하기'}</button>
                            {notice && <span className="admin-success">{notice}</span>}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default AdminPage;