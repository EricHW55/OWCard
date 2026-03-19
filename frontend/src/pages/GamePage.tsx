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
  } catch {
    return null;
  }
}

function getSession() {
  const token = sessionStorage.getItem('access_token');
  const playerIdRaw = sessionStorage.getItem('player_id');
  if (!token || !playerIdRaw) return null;

  const decoded = decodeJwt(token);
  return {
    token,
    player_id: Number(playerIdRaw),
    username:
        sessionStorage.getItem('username') ||
        decoded?.username ||
        sessionStorage.getItem('nickname') ||
        `player_${playerIdRaw}`,
  };
}

const btnS: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  background: '#243055',
  border: '1px solid #3a4a78',
  color: '#e8ecf8',
  cursor: 'pointer',
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

  const wsRef = useRef<GameSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-29), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!session || !gameId) return;

    const ws = new GameSocket();
    wsRef.current = ws;

    ws.connect(
        buildWsUrl(`/ws/game/${gameId}`, {
          token: session.token,
          player_id: session.player_id,
        })
    );

    const offConnected = ws.on('_connected', () => {
      setConnected(true);
      addLog('게임 소켓 연결됨');
    });

    const offDisconnected = ws.on('_disconnected', () => {
      setConnected(false);
      addLog('게임 소켓 연결 종료');
    });

    const offGameState = ws.on('game_state', (msg: any) => {
      setGs(msg.state);
    });

    const offActionResult = ws.on('action_result', (msg: any) => {
      addLog(`내 행동: ${msg.action}`);
      if (msg.result) addLog(JSON.stringify(msg.result));
    });

    const offOpponentAction = ws.on('opponent_action', (msg: any) => {
      addLog(`상대 행동: ${msg.action}`);
      if (msg.result) addLog(JSON.stringify(msg.result));
    });

    const offPhaseChange = ws.on('phase_change', (msg: any) => {
      addLog(msg.message || `페이즈 변경: ${msg.phase}`);
    });

    const offGameOver = ws.on('game_over', (msg: any) => {
      addLog(`게임 종료! 승자: ${msg.winner_name ?? msg.winner}`);
    });

    const offOpponentDisconnected = ws.on('opponent_disconnected', () => {
      addLog('상대가 연결을 끊었습니다.');
    });

    const offError = ws.on('error', (msg: any) => {
      addLog(`오류: ${msg.message}`);
    });

    return () => {
      offConnected();
      offDisconnected();
      offGameState();
      offActionResult();
      offOpponentAction();
      offPhaseChange();
      offGameOver();
      offOpponentDisconnected();
      offError();
      ws.disconnect();
    };
  }, [session, gameId, addLog]);

  const send = (data: Record<string, unknown>) => {
    if (wsRef.current?.connected) {
      wsRef.current.send(data);
    } else {
      addLog(`전송 실패(미연결): ${JSON.stringify(data)}`);
    }
  };

  if (!session) {
    return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e1a', color: '#fff' }}>
          <div>로그인이 필요합니다.</div>
        </div>
    );
  }

  if (!gs) {
    return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0e1a', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>게임 로딩 중...</div>
            <div style={{ marginTop: 8, color: '#8a94b8' }}>
              game_id: {gameId} / {connected ? '소켓 연결됨' : '연결 중'}
            </div>
          </div>
        </div>
    );
  }

  const { phase, turn, round, is_my_turn } = gs;
  const my = gs.my_state;
  const opp = gs.opponent_state;

  const selectedHandCard = selectedHandIdx !== null ? my.hand[selectedHandIdx] : null;
  const selectedMyFieldCard = [...my.field.main, ...my.field.side].find((c) => c.uid === selectedFieldUid) || null;

  const handleHandClick = (card: HandCard, index: number) => {
    if (phase === 'mulligan') {
      setSelectedMulligan((prev) =>
          prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].slice(0, 2)
      );
      return;
    }

    if (selectedHandIdx === index) {
      setDetailCard(card);
      setSelectedHandIdx(null);
      setActionMode(null);
      return;
    }

    setSelectedHandIdx(index);
    setSelectedFieldUid(null);
    setActionMode(null);
  };

  const handleFieldClick = (card: FieldCard, isOpponentField: boolean) => {
    if (!gs) return;

    if (actionMode && isOpponentField) {
      if (actionMode === 'spell' && selectedHandIdx !== null) {
        const spell = my.hand[selectedHandIdx];
        send({
          action: 'execute_spell',
          hero_key: spell.hero_key,
          target_uid: card.uid,
        });
        addLog(`${spell.name} → ${card.name} 사용`);
        setSelectedHandIdx(null);
        setActionMode(null);
        return;
      }

      const attacker = [...my.field.main, ...my.field.side].find((c) => c.uid === selectedFieldUid);
      if (!attacker) return;

      if (actionMode === 'attack') {
        send({ action: 'basic_attack', attacker_uid: attacker.uid, target_uid: card.uid });
        addLog(`${attacker.name} → ${card.name} 공격`);
      } else if (actionMode === 'skill') {
        send({ action: 'use_skill', caster_uid: attacker.uid, skill_key: 'skill_1', target_uid: card.uid });
        addLog(`${attacker.name} → ${card.name} 스킬1`);
      }

      setSelectedFieldUid(null);
      setActionMode(null);
      return;
    }

    if (!isOpponentField) {
      if (selectedFieldUid === card.uid) {
        setDetailCard(card);
        setSelectedFieldUid(null);
      } else {
        setSelectedFieldUid(card.uid);
        setSelectedHandIdx(null);
        setActionMode(null);
      }
    } else {
      setDetailCard(card);
    }
  };

  const handlePlace = (zone: 'main' | 'side') => {
    if (selectedHandIdx === null) return;
    const card = my.hand[selectedHandIdx];
    if (card.is_spell) {
      addLog('스킬 카드는 배치가 아니라 액션 페이즈에서 사용해.');
      return;
    }

    send({ action: 'place_card', hand_index: selectedHandIdx, zone });
    addLog(`${card.name} → ${zone === 'main' ? '본대' : '사이드'} 배치`);
    setSelectedHandIdx(null);
  };

  const actionDisabled = !is_my_turn || phase !== 'action';

  return (
      <div
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #111832 100%)',
            color: '#e8ecf8',
            overflow: 'hidden',
          }}
      >
        {/* 상단 바 */}
        <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 12px',
              background: '#0d1225',
              borderBottom: '1px solid #2a3560',
              flexShrink: 0,
            }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#ff9b30', fontWeight: 700 }}>R{round} · T{turn}</span>
            <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: 700,
                  background: '#243055',
                  border: '1px solid #3a4a78',
                }}
            >
            {PHASE_LABEL[phase]}
          </span>
          </div>

          <div style={{ fontSize: 10, color: '#8a94b8' }}>
            상대 패:{opp.hand_count} · 덱:{opp.draw_pile_count}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: is_my_turn ? '#22dd77' : '#ff3355' }}>
              {is_my_turn ? '● 내 턴' : '○ 상대 턴'}
            </div>
            <button
                onClick={() => navigate('/')}
                style={{ ...btnS, background: '#1a2342' }}
            >
              로비로
            </button>
          </div>
        </div>

        {/* 전장 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '6px 10px', gap: 4, overflow: 'hidden', minHeight: 0 }}>
          <FieldSection
              field={opp.field}
              isOpponent={true}
              selectedUid={null}
              onCardClick={(c) => handleFieldClick(c, true)}
              placingCard={null}
              onPlaceClick={() => {}}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', flexShrink: 0 }}>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a4a78, transparent)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: is_my_turn ? '#fff' : '#2a3560', border: '2px solid #3a4a78' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff3355', opacity: 0.3, border: '2px solid #3a4a78' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#44aaff', opacity: 0.3, border: '2px solid #3a4a78' }} />
            </div>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #3a4a78, transparent)' }} />
          </div>

          <FieldSection
              field={my.field}
              isOpponent={false}
              selectedUid={selectedFieldUid}
              onCardClick={(c) => handleFieldClick(c, false)}
              placingCard={phase === 'placement' && selectedHandCard && !selectedHandCard.is_spell ? selectedHandCard : null}
              onPlaceClick={handlePlace}
          />
        </div>

        {/* 멀리건 바 */}
        {phase === 'mulligan' && is_my_turn && (
            <div style={{ display: 'flex', gap: 8, padding: '6px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#ff9b30', fontWeight: 700 }}>
            멀리건 선택: {selectedMulligan.length}/2
          </span>
              <button
                  style={btnS}
                  onClick={() => {
                    send({ action: 'mulligan', card_indices: selectedMulligan });
                    addLog(`멀리건 요청: ${selectedMulligan.join(', ') || '없음'}`);
                    setSelectedMulligan([]);
                  }}
              >
                멀리건 실행
              </button>
              <button
                  style={{ ...btnS, background: '#1a2342' }}
                  onClick={() => {
                    send({ action: 'skip_mulligan' });
                    addLog('멀리건 스킵');
                    setSelectedMulligan([]);
                  }}
              >
                스킵
              </button>
            </div>
        )}

        {/* 액션 바 - 유닛 */}
        {selectedMyFieldCard && !selectedMyFieldCard.placed_this_turn && phase === 'action' && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ff9b30', fontWeight: 700 }}>{selectedMyFieldCard.name}</span>
              <button
                  disabled={actionDisabled}
                  onClick={() => { setActionMode('attack'); addLog(`${selectedMyFieldCard.name} 공격 대상 선택...`); }}
                  style={btnS}
              >
                ⚔ 공격
              </button>
              <button
                  disabled={actionDisabled}
                  onClick={() => { setActionMode('skill'); addLog(`${selectedMyFieldCard.name} 스킬1 대상 선택...`); }}
                  style={btnS}
              >
                ✦ 스킬1
              </button>
              <button onClick={() => { setSelectedFieldUid(null); setActionMode(null); }} style={{ ...btnS, background: '#1a2342' }}>
                취소
              </button>
              {actionMode && <span style={{ fontSize: 10, color: '#ffaa22' }}>→ 상대 카드를 클릭</span>}
            </div>
        )}

        {/* 액션 바 - 스펠 */}
        {selectedHandCard?.is_spell && phase === 'action' && (
            <div style={{ display: 'flex', gap: 6, padding: '5px 12px', background: '#0d1225', borderTop: '1px solid #2a3560', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#ffaa22', fontWeight: 700 }}>{selectedHandCard.name}</span>
              <button
                  disabled={actionDisabled}
                  onClick={() => {
                    setActionMode('spell');
                    addLog(`${selectedHandCard.name} 대상 선택...`);
                  }}
                  style={btnS}
              >
                ✦ 스킬 카드 사용
              </button>
              <button onClick={() => { setSelectedHandIdx(null); setActionMode(null); }} style={{ ...btnS, background: '#1a2342' }}>
                취소
              </button>
              {actionMode === 'spell' && <span style={{ fontSize: 10, color: '#ffaa22' }}>→ 상대 카드를 클릭</span>}
            </div>
        )}

        {/* 하단: 손패 + 컨트롤 */}
        <div style={{ background: '#0d1225', borderTop: '1px solid #2a3560', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 5, padding: '6px 12px', overflowX: 'auto', justifyContent: my.hand.length <= 6 ? 'center' : 'flex-start' }}>
            {my.hand.map((card, i) => (
                <HandCardComp
                    key={`${card.id}-${i}`}
                    card={card}
                    selected={phase === 'mulligan' ? selectedMulligan.includes(i) : selectedHandIdx === i}
                    onClick={() => handleHandClick(card, i)}
                />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 6px', borderTop: '1px solid #1a2342' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#8a94b8' }}>
              패:{my.hand_count} · 덱:{my.draw_pile_count} · 트래시:{my.trash_count}
            </span>
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {phase === 'placement' && <span style={{ fontSize: 10, color: '#ffaa22' }}>배치 {my.placement_cost_used}/2</span>}

              {phase !== 'mulligan' && (
                  <button
                      disabled={!is_my_turn}
                      onClick={() => {
                        if (phase === 'placement') {
                          send({ action: 'end_placement' });
                          addLog('배치 완료');
                        } else if (phase === 'action') {
                          send({ action: 'end_turn' });
                          addLog('턴 종료');
                        }
                      }}
                      style={{
                        padding: '7px 18px',
                        borderRadius: 6,
                        fontWeight: 900,
                        fontSize: 13,
                        background: '#ff9b30',
                        border: 'none',
                        color: '#0a0e1a',
                        cursor: 'pointer',
                        boxShadow: '0 0 14px rgba(255,155,48,0.3)',
                        opacity: is_my_turn ? 1 : 0.5,
                      }}
                  >
                    {phase === 'placement' ? '배치 완료' : phase === 'action' ? '턴 종료' : '대기'}
                  </button>
              )}
            </div>
          </div>

          <div style={{ maxHeight: 80, overflowY: 'auto', fontSize: 9, color: '#8a94b8', background: '#0a0e1a', padding: '4px 12px' }}>
            {logs.map((l, i) => (
                <div key={i} style={{ padding: '1px 0', borderBottom: '1px solid #111832' }}>
                  {l}
                </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
      </div>
  );
};

export default GamePage;