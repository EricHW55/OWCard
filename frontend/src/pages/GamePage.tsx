import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GameState, FieldCard, HandCard } from '../types/game';
import { PHASE_LABEL } from '../types/constants';
import { GameSocket, buildWsUrl } from '../api/ws';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';

function decodeJwt(token: string): any | null {
  try { return JSON.parse(window.atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return null; }
}

function getSession() {
  const token = sessionStorage.getItem('access_token');
  const pid = sessionStorage.getItem('player_id');
  if (!token || !pid) return null;
  const d = decodeJwt(token);
  return { token, player_id: Number(pid), username: sessionStorage.getItem('username') || d?.username || `p${pid}` };
}

const btnS: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
  background: '#243055', border: '1px solid #3a4a78', color: '#e8ecf8', cursor: 'pointer',
};

const GamePage: React.FC = () => {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();
  const session = useMemo(() => getSession(), []);

  const [gs, setGs] = useState<GameState | null>(null);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [selectedMulligan, setSelectedMulligan] = useState<number[]>([]);
  // actionMode: 사용할 스킬 키 (예: "skill_1") 또는 "spell"
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [logs, setLogs] = useState<string[]>(['게임 서버에 연결 중...']);
  const [connected, setConnected] = useState(false);
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);

  const wsRef = useRef<GameSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-29), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // ── WebSocket ─────────────────────────
  useEffect(() => {
    if (!session || !gameId) return;
    const ws = new GameSocket();
    wsRef.current = ws;
    ws.connect(buildWsUrl(`/ws/game/${gameId}`, { token: session.token, player_id: session.player_id }));

    const offs = [
      ws.on('_connected', () => { setConnected(true); addLog('소켓 연결됨'); }),
      ws.on('_disconnected', () => { setConnected(false); addLog('소켓 끊김'); }),
      ws.on('game_state', (msg: any) => setGs(msg.state)),
      ws.on('action_result', (msg: any) => {
        addLog(`내 행동: ${msg.action}`);
        if (msg.action === 'place_card' && msg.result?.type === 'spell_played' && msg.result?.needs_target) {
          setPendingSpell(msg.result.hero_key);
          setActionMode('spell');
          addLog('스킬 카드 대상 선택');
        }
      }),
      ws.on('opponent_action', (msg: any) => addLog(`상대: ${msg.action}`)),
      ws.on('phase_change', (msg: any) => addLog(msg.message || `페이즈: ${msg.phase}`)),
      ws.on('game_over', (msg: any) => addLog(`게임 종료! 승자: ${msg.winner_name ?? msg.winner}`)),
      ws.on('opponent_disconnected', () => addLog('상대 연결 끊김')),
      ws.on('error', (msg: any) => addLog(`오류: ${msg.message}`)),
    ];
    return () => { offs.forEach(off => off()); ws.disconnect(); };
  }, [session, gameId, addLog]);

  const send = (data: Record<string, unknown>) => {
    if (wsRef.current?.connected) wsRef.current.send(data);
    else addLog('전송 실패(미연결)');
  };

  // ── 로딩 화면 ─────────────────────────
  if (!session) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e1a', color: '#fff' }}><div>로그인이 필요합니다.</div></div>;
  if (!gs) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e1a', color: '#fff' }}><div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 900 }}>게임 로딩 중...</div><div style={{ marginTop: 8, color: '#8a94b8' }}>game_id: {gameId} / {connected ? '연결됨' : '연결 중'}</div></div></div>;

  const { phase, turn, round, is_my_turn } = gs;
  const my = gs.my_state;
  const opp = gs.opponent_state;

  const selectedHandCard = selectedHandIdx !== null ? my.hand[selectedHandIdx] : null;
  const allMyField = [...my.field.main, ...my.field.side];
  const allOppField = [...opp.field.main, ...opp.field.side];
  const selectedMyFieldCard = allMyField.find(c => c.uid === selectedFieldUid) || null;

  // 행동 가능 카드 (액션 페이즈, 내 턴, 배치 아닌 + 아직 행동 안 한 카드)
  const canActUids = (phase === 'action' && is_my_turn)
      ? allMyField.filter(c => !c.placed_this_turn && !c.acted_this_turn).map(c => c.uid) : [];

  // ── 손패 클릭 ─────────────────────────
  const handleHandClick = (card: HandCard, index: number) => {
    if (phase === 'mulligan') {
      setSelectedMulligan(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].slice(0, 2));
      return;
    }
    if (selectedHandIdx === index) { setDetailCard(card); setSelectedHandIdx(null); setActionMode(null); return; }
    setSelectedHandIdx(index);
    setSelectedFieldUid(null);
    setActionMode(null);
    setPendingSpell(null);
  };

  // ── 필드 카드 클릭 ────────────────────
  const handleFieldClick = (card: FieldCard, isOpp: boolean) => {
    // 스킬 카드 타겟 선택 (배치 턴에서 스킬 카드 사용 후)
    if (actionMode === 'spell' && pendingSpell) {
      send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: card.uid });
      addLog(`스킬 카드 → ${card.name}`);
      setActionMode(null); setPendingSpell(null); setSelectedHandIdx(null);
      return;
    }

    // 스킬 타겟 선택 (액션 턴에서 필드 카드 스킬 사용 중)
    if (actionMode && actionMode !== 'spell' && selectedFieldUid) {
      const caster = allMyField.find(c => c.uid === selectedFieldUid);
      if (caster) {
        send({ action: 'use_skill', caster_uid: caster.uid, skill_key: actionMode, target_uid: card.uid });
        addLog(`${caster.name} → ${card.name} (${actionMode})`);
      }
      setSelectedFieldUid(null); setActionMode(null);
      return;
    }

    // 일반 클릭
    if (!isOpp) {
      if (selectedFieldUid === card.uid) { setDetailCard(card); setSelectedFieldUid(null); }
      else { setSelectedFieldUid(card.uid); setSelectedHandIdx(null); setActionMode(null); setPendingSpell(null); }
    } else {
      setDetailCard(card);
    }
  };

  // ── 카드 배치 ─────────────────────────
  const handlePlace = (zone: 'main' | 'side') => {
    if (selectedHandIdx === null || !is_my_turn || phase !== 'placement') return;
    const card = my.hand[selectedHandIdx];
    send({ action: 'place_card', hand_index: selectedHandIdx, zone });
    addLog(`${card.name} → ${zone === 'main' ? '본대' : '사이드'} ${card.is_spell ? '사용' : '배치'}`);
    setSelectedHandIdx(null);
  };

  // ── 선택된 필드 카드의 스킬 목록 ──────
  const fieldSkills: { key: string; name: string; onCooldown: boolean; cdLeft: number }[] = [];
  if (selectedMyFieldCard && !selectedMyFieldCard.placed_this_turn && !selectedMyFieldCard.acted_this_turn && phase === 'action' && is_my_turn) {
    const meta = selectedMyFieldCard.skill_meta || {};
    const cds = selectedMyFieldCard.skill_cooldowns || {};
    for (const [key, m] of Object.entries(meta)) {
      fieldSkills.push({
        key,
        name: (m as any)?.name || key,
        onCooldown: (cds[key] ?? 0) > 0,
        cdLeft: cds[key] ?? 0,
      });
    }
  }

  return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0a0e1a 0%, #111832 100%)', color: '#e8ecf8', overflow: 'hidden' }}>

        {/* ══ 상단 바 ════════════════════════ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#0d1225', borderBottom: '1px solid #2a3560', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#ff9b30', fontWeight: 700 }}>R{round} · T{turn}</span>
            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: '#243055', border: '1px solid #3a4a78' }}>{PHASE_LABEL[phase]}</span>
          </div>
          <div style={{ fontSize: 10, color: '#8a94b8' }}>상대 패:{opp.hand_count} · 덱:{opp.draw_pile_count}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: is_my_turn ? '#22dd77' : '#ff3355' }}>{is_my_turn ? '● 내 턴' : '○ 상대 턴'}</div>
            <button onClick={() => {
              if (gs && gs.phase !== 'game_over') {
                send({ action: 'leave_game' });
              }
              navigate('/');
            }} style={{ ...btnS, background: '#1a2342' }}>나가기</button>
          </div>
        </div>

        {/* ══ 전장 ═══════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 8px', gap: 2, overflow: 'hidden', minHeight: 0 }}>
          <FieldSection field={opp.field} isOpponent={true} isMyTurn={is_my_turn} phase={phase} selectedUid={null} canActUids={[]} onCardClick={c => handleFieldClick(c, true)} placingCard={null} onPlaceClick={() => {}} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0', flexShrink: 0 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a4a78, transparent)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: is_my_turn ? '#fff' : '#2a3560', border: '2px solid #3a4a78' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3355', opacity: 0.3, border: '2px solid #3a4a78' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#44aaff', opacity: 0.3, border: '2px solid #3a4a78' }} />
            </div>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a4a78, transparent)' }} />
          </div>

          <FieldSection field={my.field} isOpponent={false} isMyTurn={is_my_turn} phase={phase} selectedUid={selectedFieldUid} canActUids={canActUids} onCardClick={c => handleFieldClick(c, false)} placingCard={phase === 'placement' && is_my_turn && selectedHandCard && !selectedHandCard.is_spell ? selectedHandCard : null} onPlaceClick={handlePlace} />
        </div>

        {/* ══ 멀리건 바 ═════════════════════ */}
        {phase === 'mulligan' && !my.mulligan_done && (
            <div style={{ display: 'flex', gap: 8, padding: '6px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#ff9b30', fontWeight: 700 }}>멀리건: {selectedMulligan.length}/2</span>
              <button style={btnS} onClick={() => { send({ action: 'mulligan', card_indices: selectedMulligan }); setSelectedMulligan([]); }}>멀리건 실행</button>
              <button style={{ ...btnS, background: '#1a2342' }} onClick={() => { send({ action: 'skip_mulligan' }); setSelectedMulligan([]); }}>스킵</button>
            </div>
        )}

        {/* ══ 액션 바 — 스킬별 버튼 ════════ */}
        {fieldSkills.length > 0 && (
            <div style={{ display: 'flex', gap: 5, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#ff9b30', fontWeight: 700, marginRight: 4 }}>{selectedMyFieldCard!.name}</span>
              {fieldSkills.map(sk => (
                  <button
                      key={sk.key}
                      disabled={sk.onCooldown}
                      onClick={() => { setActionMode(sk.key); addLog(`${selectedMyFieldCard!.name} — ${sk.name} 대상 선택...`); }}
                      style={{
                        ...btnS,
                        opacity: sk.onCooldown ? 0.4 : 1,
                        background: actionMode === sk.key ? '#ff9b3040' : '#243055',
                        border: actionMode === sk.key ? '1px solid #ff9b30' : '1px solid #3a4a78',
                      }}
                  >
                    ✦ {sk.name}{sk.onCooldown ? ` (${sk.cdLeft}턴)` : ''}
                  </button>
              ))}
              <button onClick={() => { setSelectedFieldUid(null); setActionMode(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
              {actionMode && actionMode !== 'spell' && <span style={{ fontSize: 10, color: '#ffaa22' }}>→ 아군 또는 상대 카드를 클릭</span>}
            </div>
        )}

        {/* ══ 스킬 카드 타겟 선택 바 ════════ */}
        {actionMode === 'spell' && pendingSpell && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ffaa22', fontWeight: 700 }}>스킬 카드 대상 선택</span>
              <button onClick={() => { setActionMode(null); setPendingSpell(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
              <span style={{ fontSize: 10, color: '#ffaa22' }}>→ 카드를 클릭</span>
            </div>
        )}

        {/* ══ 배치 턴 — 스킬 카드 사용 바 ══ */}
        {phase === 'placement' && is_my_turn && selectedHandCard?.is_spell && !pendingSpell && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ffaa22', fontWeight: 700 }}>{selectedHandCard.name}</span>
              <button onClick={() => handlePlace('main')} style={btnS}>✦ 스킬 카드 사용</button>
              <button onClick={() => setSelectedHandIdx(null)} style={{ ...btnS, background: '#1a2342' }}>취소</button>
            </div>
        )}

        {/* ══ 하단: 손패 + 컨트롤 ══════════ */}
        <div style={{ background: '#0d1225', borderTop: '1px solid #2a3560', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 5, padding: '6px 12px', overflowX: 'auto', justifyContent: my.hand.length <= 6 ? 'center' : 'flex-start' }}>
            {my.hand.map((card, i) => (
                <HandCardComp key={`${card.id}-${i}`} card={card} selected={phase === 'mulligan' ? selectedMulligan.includes(i) : selectedHandIdx === i} onClick={() => handleHandClick(card, i)} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 6px', borderTop: '1px solid #1a2342' }}>
            <span style={{ fontSize: 9, color: '#8a94b8' }}>패:{my.hand_count} · 덱:{my.draw_pile_count} · 트래시:{my.trash_count}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {phase === 'placement' && <span style={{ fontSize: 10, color: '#ffaa22' }}>배치 {my.placement_cost_used}/2</span>}
              {phase !== 'mulligan' && (
                  <button disabled={!is_my_turn} onClick={() => {
                    if (phase === 'placement') { send({ action: 'end_placement' }); addLog('배치 완료'); }
                    else if (phase === 'action') { send({ action: 'end_turn' }); addLog('턴 종료'); }
                  }} style={{ padding: '7px 18px', borderRadius: 6, fontWeight: 900, fontSize: 13, background: '#ff9b30', border: 'none', color: '#0a0e1a', cursor: 'pointer', boxShadow: '0 0 14px rgba(255,155,48,0.3)', opacity: is_my_turn ? 1 : 0.5 }}>
                    {phase === 'placement' ? '배치 완료' : phase === 'action' ? '턴 종료' : '대기'}
                  </button>
              )}
            </div>
          </div>
          <div style={{ maxHeight: 70, overflowY: 'auto', fontSize: 9, color: '#8a94b8', background: '#0a0e1a', padding: '4px 12px' }}>
            {logs.map((l, i) => <div key={i} style={{ padding: '1px 0', borderBottom: '1px solid #111832' }}>{l}</div>)}
            <div ref={logEndRef} />
          </div>
        </div>

        <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
      </div>
  );
};

export default GamePage;
