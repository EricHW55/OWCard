import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GameState, FieldCard, HandCard } from '../types/game';
import { PHASE_LABEL } from '../types/constants';
import { GameSocket, buildWsUrl } from '../api/ws';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';

function decodeJwt(token: string): any | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch { return null; }
}

function getSession() {
  const token = sessionStorage.getItem('access_token');
  const playerIdRaw = sessionStorage.getItem('player_id');
  if (!token || !playerIdRaw) return null;
  const decoded = decodeJwt(token);
  return {
    token,
    player_id: Number(playerIdRaw),
    username: sessionStorage.getItem('username') || decoded?.username || sessionStorage.getItem('nickname') || `player_${playerIdRaw}`,
  };
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
  const [actionMode, setActionMode] = useState<'attack' | 'skill' | 'spell' | null>(null);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [logs, setLogs] = useState<string[]>(['게임 서버에 연결 중...']);
  const [connected, setConnected] = useState(false);

  // 스킬 카드 사용 후 타겟 대기 중인 spell hero_key
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);

  const wsRef = useRef<GameSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-29), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // ── WebSocket ─────────────────────────
  useEffect(() => {
    if (!session || !gameId) return;
    const ws = new GameSocket();
    wsRef.current = ws;
    ws.connect(buildWsUrl(`/ws/game/${gameId}`, { token: session.token, player_id: session.player_id }));

    const offs = [
      ws.on('_connected', () => { setConnected(true); addLog('게임 소켓 연결됨'); }),
      ws.on('_disconnected', () => { setConnected(false); addLog('게임 소켓 연결 종료'); }),
      ws.on('game_state', (msg: any) => { setGs(msg.state); }),
      ws.on('action_result', (msg: any) => {
        addLog(`내 행동: ${msg.action}`);
        // place_card로 spell 낸 경우 → 타겟 필요하면 pending
        if (msg.action === 'place_card' && msg.result?.type === 'spell_played' && msg.result?.needs_target) {
          setPendingSpell(msg.result.hero_key);
          setActionMode('spell');
          addLog(`스킬 카드 대상을 선택하세요`);
        }
      }),
      ws.on('opponent_action', (msg: any) => { addLog(`상대 행동: ${msg.action}`); }),
      ws.on('phase_change', (msg: any) => { addLog(msg.message || `페이즈: ${msg.phase}`); }),
      ws.on('game_over', (msg: any) => { addLog(`게임 종료! 승자: ${msg.winner_name ?? msg.winner}`); }),
      ws.on('opponent_disconnected', () => { addLog('상대 연결 끊김'); }),
      ws.on('error', (msg: any) => { addLog(`오류: ${msg.message}`); }),
    ];
    return () => { offs.forEach(off => off()); ws.disconnect(); };
  }, [session, gameId, addLog]);

  const send = (data: Record<string, unknown>) => {
    if (wsRef.current?.connected) wsRef.current.send(data);
    else addLog(`전송 실패(미연결)`);
  };

  // ── 로딩/에러 화면 ────────────────────
  if (!session) return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e1a', color: '#fff' }}>
        <div>로그인이 필요합니다.</div>
      </div>
  );

  if (!gs) return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e1a', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 900 }}>게임 로딩 중...</div>
          <div style={{ marginTop: 8, color: '#8a94b8' }}>game_id: {gameId} / {connected ? '연결됨' : '연결 중'}</div>
        </div>
      </div>
  );

  const { phase, turn, round, is_my_turn } = gs;
  const my = gs.my_state;
  const opp = gs.opponent_state;

  const selectedHandCard = selectedHandIdx !== null ? my.hand[selectedHandIdx] : null;
  const allMyFieldCards = [...my.field.main, ...my.field.side];
  const selectedMyFieldCard = allMyFieldCards.find((c) => c.uid === selectedFieldUid) || null;

  // ── 행동 가능한 카드 uid (액션 페이즈, 내 턴, 이번턴 배치 아닌 카드) ──
  const canActUids: string[] = (phase === 'action' && is_my_turn)
      ? allMyFieldCards.filter(c => !c.placed_this_turn).map(c => c.uid)
      : [];

  const actionDisabled = !is_my_turn || phase !== 'action';

  // ── 손패 클릭 ─────────────────────────
  const handleHandClick = (card: HandCard, index: number) => {
    // 멀리건 모드
    if (phase === 'mulligan') {
      setSelectedMulligan(prev =>
          prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].slice(0, 2)
      );
      return;
    }
    // 같은 카드 다시 클릭 → 상세
    if (selectedHandIdx === index) {
      setDetailCard(card);
      setSelectedHandIdx(null);
      setActionMode(null);
      return;
    }
    setSelectedHandIdx(index);
    setSelectedFieldUid(null);
    setActionMode(null);
    setPendingSpell(null);
  };

  // ── 필드 카드 클릭 ────────────────────
  const handleFieldClick = (card: FieldCard, isOpponentField: boolean) => {
    if (!gs) return;

    // 스킬 카드 타겟 선택 모드 (배치 턴에 스킬 카드 사용 후)
    if (actionMode === 'spell' && pendingSpell && isOpponentField) {
      send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: card.uid });
      addLog(`스킬 카드 → ${card.name} 사용`);
      setActionMode(null);
      setPendingSpell(null);
      setSelectedHandIdx(null);
      return;
    }

    // 액션 모드에서 상대 카드 클릭 → 공격/스킬
    if (actionMode && isOpponentField && selectedFieldUid) {
      const attacker = allMyFieldCards.find(c => c.uid === selectedFieldUid);
      if (!attacker) return;
      if (actionMode === 'attack') {
        send({ action: 'basic_attack', attacker_uid: attacker.uid, target_uid: card.uid });
        addLog(`${attacker.name} → ${card.name} 공격`);
      } else if (actionMode === 'skill') {
        send({ action: 'use_skill', caster_uid: attacker.uid, skill_key: 'skill_1', target_uid: card.uid });
        addLog(`${attacker.name} → ${card.name} 스킬`);
      }
      setSelectedFieldUid(null);
      setActionMode(null);
      return;
    }

    // 내 카드 클릭
    if (!isOpponentField) {
      if (selectedFieldUid === card.uid) {
        setDetailCard(card); setSelectedFieldUid(null);
      } else {
        setSelectedFieldUid(card.uid); setSelectedHandIdx(null); setActionMode(null); setPendingSpell(null);
      }
    } else {
      // 상대 카드 클릭 (액션 모드 아닐 때) → 상세
      setDetailCard(card);
    }
  };

  // ── 카드 배치 (배치 턴) ───────────────
  const handlePlace = (zone: 'main' | 'side') => {
    if (selectedHandIdx === null || !is_my_turn || phase !== 'placement') return;
    const card = my.hand[selectedHandIdx];

    // 스킬 카드도 배치 턴에 place_card로 보냄 → 서버가 spell_played 반환
    send({ action: 'place_card', hand_index: selectedHandIdx, zone });
    addLog(`${card.name} → ${zone === 'main' ? '본대' : '사이드'} ${card.is_spell ? '사용' : '배치'}`);
    setSelectedHandIdx(null);
  };

  return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, #0a0e1a 0%, #111832 100%)', color: '#e8ecf8', overflow: 'hidden' }}>

        {/* ══ 상단 바 ═══════════════════════ */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#0d1225', borderBottom: '1px solid #2a3560', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#ff9b30', fontWeight: 700 }}>R{round} · T{turn}</span>
            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: '#243055', border: '1px solid #3a4a78' }}>{PHASE_LABEL[phase]}</span>
          </div>
          <div style={{ fontSize: 10, color: '#8a94b8' }}>상대 패:{opp.hand_count} · 덱:{opp.draw_pile_count}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: is_my_turn ? '#22dd77' : '#ff3355' }}>
              {is_my_turn ? '● 내 턴' : '○ 상대 턴'}
            </div>
            <button onClick={() => navigate('/')} style={{ ...btnS, background: '#1a2342' }}>로비로</button>
          </div>
        </div>

        {/* ══ 전장 ══════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 8px', gap: 2, overflow: 'hidden', minHeight: 0 }}>

          {/* 상대 필드 */}
          <FieldSection
              field={opp.field} isOpponent={true}
              isMyTurn={is_my_turn} phase={phase}
              selectedUid={null} canActUids={[]}
              onCardClick={(c) => handleFieldClick(c, true)}
              placingCard={null} onPlaceClick={() => {}}
          />

          {/* 구분선 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0', flexShrink: 0 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a4a78, transparent)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: is_my_turn ? '#fff' : '#2a3560', border: '2px solid #3a4a78' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3355', opacity: 0.3, border: '2px solid #3a4a78' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#44aaff', opacity: 0.3, border: '2px solid #3a4a78' }} />
            </div>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a4a78, transparent)' }} />
          </div>

          {/* 내 필드 */}
          <FieldSection
              field={my.field} isOpponent={false}
              isMyTurn={is_my_turn} phase={phase}
              selectedUid={selectedFieldUid}
              canActUids={canActUids}
              onCardClick={(c) => handleFieldClick(c, false)}
              placingCard={phase === 'placement' && is_my_turn && selectedHandCard && !selectedHandCard.is_spell ? selectedHandCard : null}
              onPlaceClick={handlePlace}
          />
        </div>

        {/* ══ 멀리건 바 ════════════════════ */}
        {phase === 'mulligan' && !my.mulligan_done && (
            <div style={{ display: 'flex', gap: 8, padding: '6px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#ff9b30', fontWeight: 700 }}>멀리건: {selectedMulligan.length}/2</span>
              <button style={btnS} onClick={() => { send({ action: 'mulligan', card_indices: selectedMulligan }); addLog(`멀리건: ${selectedMulligan.join(', ') || '없음'}`); setSelectedMulligan([]); }}>멀리건 실행</button>
              <button style={{ ...btnS, background: '#1a2342' }} onClick={() => { send({ action: 'skip_mulligan' }); addLog('멀리건 스킵'); setSelectedMulligan([]); }}>스킵</button>
            </div>
        )}

        {/* ══ 액션 바 - 필드 유닛 ══════════ */}
        {selectedMyFieldCard && !selectedMyFieldCard.placed_this_turn && phase === 'action' && is_my_turn && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ff9b30', fontWeight: 700 }}>{selectedMyFieldCard.name}</span>
              <button disabled={actionDisabled} onClick={() => { setActionMode('attack'); addLog(`${selectedMyFieldCard.name} 공격 대상 선택...`); }} style={btnS}>⚔ 공격</button>
              <button disabled={actionDisabled} onClick={() => { setActionMode('skill'); addLog(`${selectedMyFieldCard.name} 스킬 대상 선택...`); }} style={btnS}>✦ 스킬</button>
              <button onClick={() => { setSelectedFieldUid(null); setActionMode(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
              {actionMode && <span style={{ fontSize: 10, color: '#ffaa22' }}>→ 상대 카드를 클릭</span>}
            </div>
        )}

        {/* ══ 스킬 카드 타겟 선택 바 ════════ */}
        {actionMode === 'spell' && pendingSpell && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ffaa22', fontWeight: 700 }}>스킬 카드 대상 선택</span>
              <button onClick={() => { setActionMode(null); setPendingSpell(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
              <span style={{ fontSize: 10, color: '#ffaa22' }}>→ 상대 카드를 클릭</span>
            </div>
        )}

        {/* ══ 배치 턴 - 스킬 카드 선택 시 바 */}
        {phase === 'placement' && is_my_turn && selectedHandCard?.is_spell && !pendingSpell && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ffaa22', fontWeight: 700 }}>{selectedHandCard.name}</span>
              <button onClick={() => handlePlace('main')} style={btnS}>✦ 스킬 카드 사용</button>
              <button onClick={() => { setSelectedHandIdx(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
            </div>
        )}

        {/* ══ 하단: 손패 + 컨트롤 ══════════ */}
        <div style={{ background: '#0d1225', borderTop: '1px solid #2a3560', flexShrink: 0 }}>
          {/* 손패 */}
          <div style={{ display: 'flex', gap: 5, padding: '6px 12px', overflowX: 'auto', justifyContent: my.hand.length <= 6 ? 'center' : 'flex-start' }}>
            {my.hand.map((card, i) => (
                <HandCardComp
                    key={`${card.id}-${i}`} card={card}
                    selected={phase === 'mulligan' ? selectedMulligan.includes(i) : selectedHandIdx === i}
                    onClick={() => handleHandClick(card, i)}
                />
            ))}
          </div>

          {/* 하단 컨트롤 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 6px', borderTop: '1px solid #1a2342' }}>
            <span style={{ fontSize: 9, color: '#8a94b8' }}>패:{my.hand_count} · 덱:{my.draw_pile_count} · 트래시:{my.trash_count}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {phase === 'placement' && <span style={{ fontSize: 10, color: '#ffaa22' }}>배치 {my.placement_cost_used}/2</span>}
              {phase !== 'mulligan' && (
                  <button
                      disabled={!is_my_turn}
                      onClick={() => {
                        if (phase === 'placement') { send({ action: 'end_placement' }); addLog('배치 완료'); }
                        else if (phase === 'action') { send({ action: 'end_turn' }); addLog('턴 종료'); }
                      }}
                      style={{
                        padding: '7px 18px', borderRadius: 6, fontWeight: 900, fontSize: 13,
                        background: '#ff9b30', border: 'none', color: '#0a0e1a', cursor: 'pointer',
                        boxShadow: '0 0 14px rgba(255,155,48,0.3)', opacity: is_my_turn ? 1 : 0.5,
                      }}
                  >
                    {phase === 'placement' ? '배치 완료' : phase === 'action' ? '턴 종료' : '대기'}
                  </button>
              )}
            </div>
          </div>

          {/* 로그 */}
          <div style={{ maxHeight: 70, overflowY: 'auto', fontSize: 9, color: '#8a94b8', background: '#0a0e1a', padding: '4px 12px' }}>
            {logs.map((l, i) => <div key={i} style={{ padding: '1px 0', borderBottom: '1px solid #111832' }}>{l}</div>)}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* ══ 카드 상세 모달 ═══════════════ */}
        <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
      </div>
  );
};

export default GamePage;
