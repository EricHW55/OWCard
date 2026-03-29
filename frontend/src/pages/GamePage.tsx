import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GameState, FieldCard, HandCard } from '../types/game';
import { PHASE_LABEL } from '../types/constants';
import { GameSocket, buildWsUrl } from '../api/ws';
import FieldSection from '../components/FieldSection';
import HandCardComp from '../components/HandCardComp';
import CardDetail from '../components/CardDetail';
import GameAnnouncer, { AnnouncerData } from '../components/GameAnnouncer';
import './GamePage.css';

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

function roleLabel(role?: string) {
  switch (role) {
    case 'tank': return '탱커';
    case 'dealer': return '딜러';
    case 'healer': return '힐러';
    case 'spell': return '스킬';
    default: return role || '미상';
  }
}

function roleClass(role?: string) {
  switch (role) {
    case 'tank': return 'tank';
    case 'dealer': return 'dealer';
    case 'healer': return 'healer';
    case 'spell': return 'spell';
    default: return 'unknown';
  }
}

type ColumnChoice = {
  source: 'skill' | 'spell';
  heroKey?: string;
  skillKey?: string;
  skillName: string;
};

type ColumnPreview = {
  key: string;
  label: string;
  repUid: string;
  names: string[];
};

function phaseLabel(phase?: string) {
  if (!phase) return '진행 중';
  return (PHASE_LABEL as Record<string, string>)[phase] || phase;
}

function phaseSubtitle(phase?: string, isMyTurn?: boolean) {
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

function getSkillNameFromCard(card: any, skillKey?: string | null) {
  const meta = card?.skill_meta || {};
  if (skillKey && meta?.[skillKey]?.name) return meta[skillKey].name as string;
  if (meta?.skill_1?.name) return meta.skill_1.name as string;
  const first = Object.values(meta).find((item: any) => item?.name) as any;
  return first?.name || card?.name || '스킬';
}

function getSkillDescriptionFromCard(card: any, skillRef?: string | null) {
  const meta = card?.skill_meta || {};
  const entries = Object.entries(meta) as [string, any][];

  if (skillRef) {
    if (meta?.[skillRef]?.description) return String(meta[skillRef].description);

    const ref = String(skillRef).trim();
    const byName = entries.find(([, item]) => String(item?.name || '').trim() === ref);
    if (byName?.[1]?.description) return String(byName[1].description);
  }

  const ordered = [...entries].sort((a, b) => {
    const getOrder = (key: string) => {
      if (key === 'passive') return -1;
      const m = key.match(/(\d+)/);
      return m ? Number(m[1]) : 999;
    };
    return getOrder(a[0]) - getOrder(b[0]);
  });

  const firstSkill = ordered.find(([key, item]) => key.startsWith('skill_') && item?.description)
      || ordered.find(([, item]) => item?.description);

  return firstSkill?.[1]?.description || card?.description || '';
}

function buildOpponentSkillCue(msg: any, opponentState?: any) {
  const result = msg?.result || {};
  const action = msg?.action;
  const hasSkillSignal =
      action === 'use_skill'
      || action === 'execute_spell'
      || !!msg?.skill_name
      || !!result?.skill_name
      || !!result?.skill
      || result?.type === 'spell_played';

  if (!hasSkillSignal) return null;

  const actorName =
      msg?.caster_name
      || msg?.actor_name
      || msg?.card_name
      || result?.caster?.name
      || result?.card?.name
      || '상대';

  const skillName =
      msg?.skill_name
      || result?.skill_name
      || result?.skill
      || result?.display_name
      || result?.card?.skill_name
      || result?.card?.name;

  if (!skillName) return null;

  const isSpell =
      action === 'execute_spell'
      || result?.type === 'spell_played'
      || !!result?.card?.is_spell
      || String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').startsWith('spell_');

  const oppField = opponentState
      ? [...(opponentState?.field?.main || []), ...(opponentState?.field?.side || [])]
      : [];

  const actorCard =
      oppField.find((c: any) => c.uid === msg?.caster_uid)
      || oppField.find((c: any) => c.name === actorName)
      || result?.caster
      || null;

  const spellCard = result?.card || {
    hero_key: result?.hero_key || msg?.hero_key,
    name: skillName,
    is_spell: true,
    description: result?.description,
  };

  const heroKey =
      (isSpell ? (result?.hero_key || msg?.hero_key || spellCard?.hero_key) : getHeroKey(actorCard))
      || result?.caster?.hero_key
      || result?.card?.hero_key
      || undefined;

  const description = isSpell
      ? getSkillDescriptionFromCard(spellCard, result?.skill_key || result?.skill || skillName)
      : getSkillDescriptionFromCard(actorCard, msg?.skill_key || result?.skill_key || result?.skill_name || result?.skill || skillName);

  return {
    title: skillName,
    subtitle: `${actorName} 사용`,
    heroKey,
    imageName: isSpell ? (spellCard?.name || skillName) : (actorCard?.name || actorName),
    isSpell,
    description,
  };
}

function getHeroKey(card: any): string {
  return String(card?.hero_key || card?.extra?._hero_key || '').toLowerCase();
}

function getChargeLevel(card: any): number {
  const raw = card?.extra?.charge_level;
  return typeof raw === 'number' ? raw : Number(raw || 0);
}

function isTargetlessSkill(card: any, skillKey: string): boolean {
  const hero = getHeroKey(card);
  const statuses = card?.statuses || [];
  const hasStatus = (name: string) => statuses.some((s: any) => s?.name === name);

  if (hero === 'tracer' && skillKey === 'skill_2') return true;
  if (hero === 'freja' && skillKey === 'skill_1') return true;
  if (hero === 'sombra' && skillKey === 'skill_2') return true;
  if (hero === 'venture' && skillKey === 'skill_1') return !hasStatus('burrowed');
  if (hero === 'soldier76' && skillKey === 'skill_1') return true;
  if (hero === 'lucio' && skillKey === 'skill_1') return true;
  if (hero === 'moira' && skillKey === 'skill_1') return true;
  if (hero === 'mizuki' && skillKey === 'skill_2') return true;
  if (hero === 'junkerqueen' && skillKey === 'skill_2') return true;
  if (hero === 'doomfist' && skillKey === 'skill_2') return true;
  if (hero === 'ramattra' && (skillKey === 'skill_2' || skillKey === 'skill_3')) return true;
  if (hero === 'sigma' && (skillKey === 'skill_1' || skillKey === 'skill_2')) return true;
  if (hero === 'roadhog' && skillKey === 'skill_2') return true;
  if (hero === 'torbjorn' && skillKey === 'skill_2') return true;

  return false;
}

function needsColumnSelector(card: any, skillKey?: string | null): boolean {
  const hero = getHeroKey(card);
  return hero === 'sojourn' && skillKey === 'skill_2';
}

function buildColumnChoices(field: any): ColumnPreview[] {
  const main = Array.isArray(field?.main) ? field.main : [];
  const side = Array.isArray(field?.side) ? field.side : [];

  const mainTanks = main.filter((c: any) => c?.role === 'tank');
  const mainDealers = main.filter((c: any) => c?.role === 'dealer');
  const mainHealers = main.filter((c: any) => c?.role === 'healer');

  const previews: ColumnPreview[] = [];

  const leftMembers = [mainTanks[0], mainDealers[0], mainHealers[0]].filter(Boolean);
  if (leftMembers.length > 0) {
    previews.push({
      key: 'main_left',
      label: '본대 좌열',
      repUid: leftMembers[0].uid,
      names: leftMembers.map((c: any) => c.name),
    });
  }

  const rightMembers = [mainDealers[1], mainHealers[1]].filter(Boolean);
  if (rightMembers.length > 0) {
    previews.push({
      key: 'main_right',
      label: '본대 우열',
      repUid: rightMembers[0].uid,
      names: rightMembers.map((c: any) => c.name),
    });
  }

  if (side.length > 0) {
    previews.push({
      key: 'side',
      label: '사이드 열',
      repUid: side[0].uid,
      names: side.map((c: any) => c.name),
    });
  }

  return previews;
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
  const [actionMode, setActionMode] = useState<string | null>(null);
  const [detailCard, setDetailCard] = useState<FieldCard | HandCard | null>(null);
  const [logs, setLogs] = useState<string[]>(['게임 서버에 연결 중...']);
  const [connected, setConnected] = useState(false);
  const [pendingSpell, setPendingSpell] = useState<string | null>(null);
  const [pendingSpellName, setPendingSpellName] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [localPendingPassive, setLocalPendingPassive] = useState<any | null>(null);
  const [localPendingSpellChoice, setLocalPendingSpellChoice] = useState<any | null>(null);
  const [columnChoice, setColumnChoice] = useState<ColumnChoice | null>(null);

  const wsRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const phaseStampRef = useRef('');
  const gsRef = useRef<GameState | null>(null);
  const pendingSpellNameRef = useRef<string | null>(null);
  const [announcerData, setAnnouncerData] = useState<AnnouncerData | null>(null);
  const announcerQueueRef = useRef<AnnouncerData[]>([]);

  const enqueueAnnouncer = useCallback((next: AnnouncerData) => {
    setAnnouncerData(prev => {
      if (!prev) return next;
      announcerQueueRef.current.push(next);
      return prev;
    });
  }, []);

  const closeAnnouncer = useCallback(() => {
    setAnnouncerData(() => announcerQueueRef.current.shift() || null);
  }, []);

  const showPhaseChange = useCallback((phaseName: string, phaseSub: string, duration = 1800) => {
    enqueueAnnouncer({ type: 'phase', title: phaseName, subtitle: phaseSub, duration });
  }, [enqueueAnnouncer]);

  const showSystemNotice = useCallback((title: string, subtitle?: string, duration = 1300) => {
    if (!title) return;
    enqueueAnnouncer({ type: 'phase', title, subtitle, duration });
  }, [enqueueAnnouncer]);

  const showSkillUse = useCallback(({
                                      skillName,
                                      description = '',
                                      heroKey = '',
                                      imageName,
                                      subtitle,
                                      isSpell = false,
                                      duration = 3200,
                                    }: {
    skillName: string;
    description?: string;
    heroKey?: string;
    imageName?: string;
    subtitle?: string;
    isSpell?: boolean;
    duration?: number;
  }) => {
    if (!skillName) return;
    enqueueAnnouncer({
      type: 'skill',
      title: skillName,
      description,
      heroKey,
      imageName,
      subtitle,
      isSpell,
      duration,
    });
  }, [enqueueAnnouncer]);

  const showPassiveNoticeFromLog = useCallback((entry: any, owner: 'my' | 'opponent') => {
    if (!entry) return;
    const ownerState = owner === 'my' ? gsRef.current?.my_state : gsRef.current?.opponent_state;
    const allCards = [...(ownerState?.field?.main || []), ...(ownerState?.field?.side || [])];
    const sourceCard = allCards.find((c: any) => c.uid === entry?.source_uid);
    const sourceName = sourceCard?.name || entry?.source_name || (owner === 'my' ? '아군' : '상대');
    const sourceHeroKey = getHeroKey(sourceCard);

    if (entry?.type === 'turn_start_passive' && entry?.result?.passive) {
      showSkillUse({
        skillName: entry.result.passive,
        subtitle: `${sourceName} 패시브`,
        description: entry?.result?.message || '',
        heroKey: sourceHeroKey,
        imageName: sourceName,
        isSpell: false,
        duration: 3000,
      });
      return;
    }

    if (entry?.type === 'auto_turret') {
      showSystemNotice('포탑 자동 공격', sourceName, 1400);
      return;
    }
    if (entry?.type === 'auto_heal') {
      showSystemNotice('자동 치유', sourceName, 1400);
      return;
    }
  }, [showSkillUse, showSystemNotice]);

  const showDeathPassiveNotice = useCallback((result: any, owner: 'my' | 'opponent') => {
    let found = false;
    const queue: any[] = [result];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      if (node.prevent_death || node.transform || node.enter_frozen) {
        found = true;
        break;
      }
      Object.values(node).forEach(v => {
        if (v && typeof v === 'object') queue.push(v);
      });
    }
    if (found) {
      showSystemNotice(owner === 'my' ? '아군 사망 패시브 발동' : '상대 사망 패시브 발동', '전투 효과 적용', 1500);
    }
  }, [showSystemNotice]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-39), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);


  useEffect(() => {
    gsRef.current = gs;
  }, [gs]);

  useEffect(() => {
    pendingSpellNameRef.current = pendingSpellName;
  }, [pendingSpellName]);


  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!gs) return;
    const stamp = `${gs.round}-${gs.turn}-${gs.phase}-${gs.is_my_turn ? 'me' : 'opp'}`;
    if (phaseStampRef.current === stamp) return;
    phaseStampRef.current = stamp;
    showPhaseChange(phaseLabel(gs.phase), phaseSubtitle(gs.phase, gs.is_my_turn), 1600);
  }, [gs, showPhaseChange]);

  useEffect(() => {
    if (!session || !gameId) return;

    manualCloseRef.current = false;
    let localWs: GameSocket | null = null;
    let offFns: Array<() => void> = [];

    const clearHeartbeat = () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const cleanupSocket = () => {
      offFns.forEach(off => {
        try { off(); } catch {}
      });
      offFns = [];
      clearHeartbeat();
      if (localWs) {
        try { localWs.disconnect(); } catch {}
        localWs = null;
      }
      wsRef.current = null;
    };

    const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        if (wsRef.current?.connected) {
          try {
            wsRef.current.send({ action: 'ping' });
          } catch {}
        }
      }, 15000);
    };

    const connectWs = () => {
      if (manualCloseRef.current) return;

      cleanupSocket();
      const ws = new GameSocket();
      localWs = ws;
      wsRef.current = ws;
      ws.connect(buildWsUrl(`/ws/game/${gameId}`, { token: session.token, player_id: session.player_id }));

      offFns = [
        ws.on('_connected', () => {
          const wasReconnecting = reconnectAttemptRef.current > 0;
          setConnected(true);
          setReconnecting(false);
          clearReconnectTimer();
          reconnectAttemptRef.current = 0;
          addLog(wasReconnecting ? '재연결 성공' : '소켓 연결됨');
          ws.send({ action: 'get_state' });
          startHeartbeat();
        }),
        ws.on('_disconnected', () => {
          setConnected(false);
          clearHeartbeat();
          if (manualCloseRef.current) return;
          setReconnecting(true);
          if (!reconnectTimerRef.current) {
            const attempt = reconnectAttemptRef.current + 1;
            const delay = Math.min(1000 * (2 ** (attempt - 1)), 5000);
            reconnectAttemptRef.current = attempt;
            addLog(`소켓 끊김 - ${Math.round(delay / 1000)}초 후 재연결 시도`);
            reconnectTimerRef.current = window.setTimeout(() => {
              reconnectTimerRef.current = null;
              connectWs();
            }, delay);
          }
        }),
        ws.on('pong', () => {}),
        ws.on('game_state', (msg: any) => {
          setGs(msg.state);
          const serverPendingPassive = msg?.state?.my_state?.pending_passive ?? msg?.state?.my_state?.pendingPassive ?? null;
          const serverPendingSpellChoice = msg?.state?.my_state?.pending_spell ?? msg?.state?.my_state?.pendingSpell ?? null;
          if (serverPendingPassive) setLocalPendingPassive(null);
          if (serverPendingSpellChoice) setLocalPendingSpellChoice(null);
          if (!serverPendingPassive && !serverPendingSpellChoice && msg?.state?.phase !== 'placement') {
            setLocalPendingPassive(null);
            setLocalPendingSpellChoice(null);
            setColumnChoice(null);
          }
        }),
        ws.on('action_result', (msg: any) => {
          addLog(`내 행동: ${msg.action}`);

          const result = msg?.result || {};
          const latestMyState = gsRef.current?.my_state as any;
          const myHand = latestMyState?.hand || [];
          const spellName =
              result?.card?.name
              || result?.skill_name
              || result?.skill
              || myHand.find((c: any) => c.hero_key === result?.hero_key)?.name
              || pendingSpellNameRef.current
              || '스킬 카드';
          const actorName =
              result?.caster_name
              || result?.caster?.name
              || result?.card?.name
              || latestMyState?.field?.main?.find?.((c: any) => c.uid === msg?.caster_uid)?.name
              || latestMyState?.field?.side?.find?.((c: any) => c.uid === msg?.caster_uid)?.name
              || '영웅';
          const resolvedSkillName = result?.skill_name || result?.skill || null;

          if (msg.action === 'place_card' && result?.type === 'spell_played' && result?.needs_target) {
            setPendingSpell(result.hero_key);
            setPendingSpellName(spellName);
            setLocalPendingSpellChoice(null);
            addLog('스킬 카드 대상 선택');

            if (result?.hero_key === 'spell_thorn_volley') {
              setActionMode(null);
              setColumnChoice({ source: 'spell', heroKey: result.hero_key, skillName: spellName });
              showSystemNotice(spellName, '열을 선택하세요', 1200);
            } else {
              setActionMode('spell');
              setColumnChoice(null);
              showSystemNotice(spellName, '대상을 선택하세요', 1200);
            }
          }

          if (msg.action === 'place_card' && result?.type === 'spell_played' && result?.needs_choice) {
            setPendingSpell(null);
            setPendingSpellName(spellName);
            setActionMode(null);
            setLocalPendingSpellChoice(result?.choice || null);
            addLog('스킬 카드 추가 선택 필요');
            showSystemNotice(spellName, '카드를 선택하세요', 1300);
          }

          if (msg.action === 'place_card' && result?.type === 'spell_played' && !result?.needs_target && !result?.needs_choice) {
            const spellCard = myHand.find((c: any) => c.hero_key === result?.hero_key) || result?.card;
            showSkillUse({
              skillName: resolvedSkillName || spellName,
              description: getSkillDescriptionFromCard(spellCard),
              heroKey: result?.hero_key || spellCard?.hero_key || '',
              imageName: spellCard?.name || spellName,
              isSpell: true,
              duration: 3200,
            });
            setLocalPendingSpellChoice(null);
          }

          if (result?.passive_triggered?.summoned) {
            addLog(`설치물 소환: ${result.passive_triggered.summoned.name}`);
            showSystemNotice(result.passive_triggered.summoned.name, '설치물 소환', 1300);
          }
          if (result?.passive_triggered?.passive) {
            showSkillUse({
              skillName: result.passive_triggered.passive,
              subtitle: `${actorName} 패시브`,
              description: result?.passive_triggered?.message || '',
              heroKey: result?.caster?.hero_key || '',
              imageName: actorName,
              isSpell: false,
              duration: 3000,
            });
          }

          if (result?.passive_triggered?.needs_choice) {
            setLocalPendingPassive(result.passive_triggered.needs_choice);
            addLog('패시브 추가 선택 필요');
            if (result.passive_triggered.passive) {
              showSystemNotice(result.passive_triggered.passive, '선택이 필요합니다', 1300);
            }
          }

          if (msg.action === 'resolve_passive_choice') {
            setLocalPendingPassive(null);
            if (result?.card?.name) {
              addLog(`패시브 처리: ${result.card.name}`);
              showSystemNotice(result.card.name, '패시브 처리', 1300);
            }
          }

          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => {
            showPassiveNoticeFromLog(entry, 'my');
          });
          showDeathPassiveNotice(result, 'my');

          if (msg.action === 'use_skill' && resolvedSkillName) {
            const casterCard =
                [...(latestMyState?.field?.main || []), ...(latestMyState?.field?.side || [])].find((c: any) => c.uid === msg?.caster_uid)
                || result?.caster;
            showSkillUse({
              skillName: resolvedSkillName,
              description: getSkillDescriptionFromCard(casterCard, msg?.skill_key || result?.skill_key || result?.skill),
              heroKey: getHeroKey(casterCard),
              imageName: casterCard?.name,
              subtitle: result?.caster_name || casterCard?.name,
              isSpell: false,
              duration: 3200,
            });
          }

          if (msg.action === 'execute_spell') {
            setLocalPendingSpellChoice(null);
            if (resolvedSkillName) {
              const spellCard = myHand.find((c: any) => c.hero_key === result?.hero_key) || result?.card;
              showSkillUse({
                skillName: resolvedSkillName,
                description: getSkillDescriptionFromCard(spellCard),
                heroKey: result?.hero_key || spellCard?.hero_key || '',
                imageName: spellCard?.name || resolvedSkillName,
                isSpell: true,
                duration: 3200,
              });
            }
          }

          if (msg.action === 'execute_spell' && result?.rescued) {
            showSystemNotice(result.rescued, 'TRASH → 패', 1400);
          }
          if (msg.action === 'execute_spell' && result?.drawn_card) {
            showSystemNotice(result.drawn_card, '덱 → 패', 1400);
          }
        }),
        ws.on('opponent_action', (msg: any) => {
          addLog(`상대: ${msg.action}`);
          const cue = buildOpponentSkillCue(msg, gsRef.current?.opponent_state);
          if (cue) {
            showSkillUse({ skillName: cue.title, description: cue.description || '', heroKey: cue.heroKey || '', imageName: cue.imageName, subtitle: cue.subtitle, isSpell: !!cue.isSpell, duration: 3200 });
          }
          const result = msg?.result || {};
          if (result?.passive_triggered?.passive) {
            showSkillUse({
              skillName: result.passive_triggered.passive,
              subtitle: '상대 패시브',
              description: result?.passive_triggered?.message || '',
              heroKey: result?.caster?.hero_key || '',
              imageName: result?.caster_name || '상대',
              isSpell: false,
              duration: 3000,
            });
          }
          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => {
            showPassiveNoticeFromLog(entry, 'opponent');
          });
          showDeathPassiveNotice(result, 'opponent');
        }),
        ws.on('phase_change', (msg: any) => addLog(msg.message || `페이즈: ${msg.phase}`)),
        ws.on('game_over', (msg: any) => {
          addLog(`게임 종료! 승자: ${msg.winner_name ?? msg.winner}`);
          setReconnecting(false);
          showPhaseChange('게임 종료', `${msg.winner_name ?? msg.winner ?? '승자 정'}`, 2000);
        }),
        ws.on('opponent_disconnected', () => addLog('상대 연결 끊김')),
        ws.on('player_reconnected', () => addLog('상대가 재연결했습니다')),
        ws.on('error', (msg: any) => {
          const shortMessage = String(msg?.message || '요청을 처리할 수 없습니다.');
          addLog(`오류: ${shortMessage}`);
          showSystemNotice('행동 불가', shortMessage, 1800);
        }),
      ];
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !manualCloseRef.current) {
        if (!wsRef.current?.connected && !reconnectTimerRef.current) {
          setReconnecting(true);
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            connectWs();
          }, 150);
        }
      }
    };

    connectWs();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      manualCloseRef.current = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearReconnectTimer();
      cleanupSocket();
    };
  }, [session, gameId, addLog, showPhaseChange, showSkillUse, showSystemNotice, showPassiveNoticeFromLog, showDeathPassiveNotice]);

  const send = (data: Record<string, unknown>) => {
    if (wsRef.current?.connected) {
      wsRef.current.send(data);
      return;
    }
    addLog('전송 실패(미연결)');
  };

  if (!session) {
    return (
        <div className="game-loading-screen">
          <div>로그인이 필요합니다.</div>
        </div>
    );
  }

  if (!gs) {
    return (
        <div className="game-loading-screen">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>게임 로딩 중...</div>
            <div style={{ marginTop: 8, color: '#8a94b8' }}>
              game_id: {gameId} / {connected ? '연결됨' : reconnecting ? '재연결 중' : '연결 중'}
            </div>
          </div>
        </div>
    );
  }

  const { phase, turn, round, is_my_turn } = gs;
  const my = gs.my_state;
  const opp = gs.opponent_state;
  const pendingPassive = (
      (my as any).pending_passive
      ?? (my as any).pendingPassive
      ?? (gs as any)?.my_state?.pending_passive
      ?? localPendingPassive
      ?? null
  ) as any;
  const pendingSpellChoice = (
      (my as any).pending_spell
      ?? (my as any).pendingSpell
      ?? (gs as any)?.my_state?.pending_spell
      ?? localPendingSpellChoice
      ?? null
  ) as any;

  const selectedHandCard = selectedHandIdx !== null ? my.hand[selectedHandIdx] : null;
  const allMyField = [...my.field.main, ...my.field.side];
  const allOppField = [...opp.field.main, ...opp.field.side];
  const selectedMyFieldCard = allMyField.find(c => c.uid === selectedFieldUid) || null;
  const enemyColumns = buildColumnChoices(opp.field);
  const selectedHeroKey = getHeroKey(selectedMyFieldCard);
  const selectedChargeLevel = getChargeLevel(selectedMyFieldCard);
  const canActUids = (phase === 'action' && is_my_turn)
      ? allMyField.filter(c => !c.placed_this_turn && !c.acted_this_turn).map(c => c.uid)
      : [];

  const handleHandClick = (card: HandCard, index: number) => {
    if (phase === 'mulligan') {
      setSelectedMulligan(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index].slice(0, 2));
      return;
    }

    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      if (card.is_spell) {
        addLog('스킬 카드는 추가 배치할 수 없음');
        return;
      }
      if (selectedHandIdx === index) {
        setSelectedHandIdx(null);
        return;
      }
      setSelectedHandIdx(index);
      setSelectedFieldUid(null);
      setActionMode(null);
      setPendingSpell(null);
      setPendingSpellName(null);
      return;
    }

    if (selectedHandIdx === index) {
      setDetailCard(card);
      setSelectedHandIdx(null);
      setActionMode(null);
      setColumnChoice(null);
      return;
    }
    setSelectedHandIdx(index);
    setSelectedFieldUid(null);
    setActionMode(null);
    setPendingSpell(null);
    setPendingSpellName(null);
  };

  const handleFieldClick = (card: FieldCard, isOpp: boolean) => {
    if (columnChoice) {
      addLog('위 패널에서 열을 선택하세요');
      return;
    }

    if (actionMode === 'spell' && pendingSpell) {
      send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: card.uid });
      addLog(`스킬 카드 → ${card.name}`);
      showSystemNotice(pendingSpellName || '스킬 카드', `${card.name} 대상`, 1200);
      setActionMode(null);
      setPendingSpell(null);
      setPendingSpellName(null);
      setColumnChoice(null);
      setSelectedHandIdx(null);
      return;
    }

    if (actionMode && actionMode !== 'spell' && selectedFieldUid) {
      const caster = allMyField.find(c => c.uid === selectedFieldUid);
      if (caster) {
        const skillName = getSkillNameFromCard(caster, actionMode);
        send({ action: 'use_skill', caster_uid: caster.uid, skill_key: actionMode, target_uid: card.uid });
        addLog(`${caster.name} → ${card.name} (${skillName})`);
        showSystemNotice(skillName, `${caster.name} 사용`, 900);
      }
      setSelectedFieldUid(null);
      setActionMode(null);
      return;
    }

    if (!isOpp) {
      if (selectedFieldUid === card.uid) {
        setDetailCard(card);
        setSelectedFieldUid(null);
      } else {
        setSelectedFieldUid(card.uid);
        setSelectedHandIdx(null);
        setActionMode(null);
        setPendingSpell(null);
        setPendingSpellName(null);
        setColumnChoice(null);
      }
    } else {
      setDetailCard(card);
    }
  };

  const handlePlace = (zone: 'main' | 'side') => {
    if (selectedHandIdx === null || !is_my_turn || phase !== 'placement') return;
    const card = my.hand[selectedHandIdx];
    const zoneLabel = zone === 'main' ? '본대' : '사이드';

    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      send({ action: 'resolve_passive_choice', hand_index: selectedHandIdx, zone });
      addLog(`${card.name} → ${zoneLabel} 추가 배치`);
      showSystemNotice(card.name, `${zoneLabel} 추가 배치`, 1200);
      setSelectedHandIdx(null);
      return;
    }

    send({ action: 'place_card', hand_index: selectedHandIdx, zone });
    addLog(`${card.name} → ${zoneLabel} ${card.is_spell ? '사용' : '배치'}`);

    if (!card.is_spell) {
      showSystemNotice(card.name, `${zoneLabel} 배치`, 1100);
    }

    setSelectedHandIdx(null);
  };

  const fieldSkills: { key: string; name: string; onCooldown: boolean; cdLeft: number }[] = [];
  if (selectedMyFieldCard && !selectedMyFieldCard.placed_this_turn && !selectedMyFieldCard.acted_this_turn && phase === 'action' && is_my_turn) {
    const meta = selectedMyFieldCard.skill_meta || {};
    const cds = selectedMyFieldCard.skill_cooldowns || {};
    const heroKey = getHeroKey(selectedMyFieldCard);
    const chargeLevel = getChargeLevel(selectedMyFieldCard);
    for (const [key, m] of Object.entries(meta)) {
      if (!key.startsWith('skill_')) continue;
      let displayName = (m as any)?.name || key;
      if (heroKey === 'sojourn' && key === 'skill_2') {
        displayName = `${displayName} [${chargeLevel}단계]`;
      }
      fieldSkills.push({
        key,
        name: displayName,
        onCooldown: (cds[key] ?? 0) > 0,
        cdLeft: cds[key] ?? 0,
      });
    }
    fieldSkills.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }

  const leaveGame = () => {
    manualCloseRef.current = true;
    if (gs && gs.phase !== 'game_over') {
      send({ action: 'leave_game' });
    }
    navigate('/');
  };

  const showContextPanel =
      (phase === 'mulligan' && !my.mulligan_done)
      || fieldSkills.length > 0
      || (actionMode === 'spell' && !!pendingSpell)
      || (phase === 'placement' && is_my_turn && !!selectedHandCard?.is_spell && !pendingSpell)
      || !!columnChoice
      || pendingPassive?.type === 'mercy_resurrect'
      || pendingPassive?.type === 'jetpack_cat_extra_place'
      || !!pendingSpellChoice;

  return (
      <div className="game-page" style={{ background: 'linear-gradient(180deg, #0a0e1a 0%, #111832 100%)', color: '#e8ecf8' }}>
        <GameAnnouncer data={announcerData} onClose={closeAnnouncer} />

        <div className="game-topbar">
          <div className="game-topbar-left">
            <span className="game-round-pill">R{round} · T{turn}</span>
            <span className="game-phase-pill">{phaseLabel(phase)}</span>
          </div>
          <div className="game-topbar-center">상대 패:{opp.hand_count} · 덱:{opp.draw_pile_count}</div>
          <div className="game-topbar-right">
            <div className={`game-turn-indicator ${is_my_turn ? 'mine' : 'theirs'}`}>
              {is_my_turn ? '● 내 턴' : '○ 상대 턴'}
            </div>
            <div className={`game-conn-badge ${connected ? 'ok' : reconnecting ? 'retry' : 'off'}`}>
              {connected ? '연결됨' : reconnecting ? '재연결 중…' : '오프라인'}
            </div>
            <button onClick={leaveGame} style={{ ...btnS, background: '#1a2342' }}>나가기</button>
          </div>
        </div>

        {reconnecting && (
            <div className="game-reconnect-banner">
              네트워크가 잠깐 끊겼어요. 자동 재연결 중입니다.
            </div>
        )}

        {pendingPassive && (
            <div className="game-passive-banner">
              패시브 선택 대기 중: {pendingPassive.type === 'mercy_resurrect' ? '메르시 부활' : pendingPassive.type}
            </div>
        )}
        {pendingSpellChoice && (
            <div className="game-passive-banner">
              스킬 카드 선택 대기 중: {pendingSpellChoice.title || pendingSpellChoice.hero_key || pendingSpellChoice.type}
            </div>
        )}

        <div className="game-battle">
          <div className="game-board-scale">
            <FieldSection
                field={opp.field}
                isOpponent={true}
                isMyTurn={is_my_turn}
                phase={phase}
                selectedUid={null}
                canActUids={[]}
                onCardClick={c => handleFieldClick(c, true)}
                placingCard={null}
                onPlaceClick={() => {}}
            />

            <div className="game-midline">
              <div className="game-midline-bar" />
              <div className="game-midline-dots">
                <div className={`game-midline-dot ${is_my_turn ? 'active' : ''}`} />
                <div className="game-midline-dot red" />
                <div className="game-midline-dot blue" />
              </div>
              <div className="game-midline-bar" />
            </div>

            <FieldSection
                field={my.field}
                isOpponent={false}
                isMyTurn={is_my_turn}
                phase={phase}
                selectedUid={selectedFieldUid}
                canActUids={canActUids}
                onCardClick={c => handleFieldClick(c, false)}
                placingCard={phase === 'placement' && is_my_turn && selectedHandCard && !selectedHandCard.is_spell ? selectedHandCard : null}
                onPlaceClick={handlePlace}
            />
          </div>
        </div>

        <div className="game-bottom-panel">
          {showContextPanel && (
              <div className="game-context-stack">
                {phase === 'mulligan' && !my.mulligan_done && (
                    <div className="game-context-panel">
                      <div className="game-context-head">
                        <span className="game-toolbar-title">멀리건 선택</span>
                        <span className="game-context-subtext">선택 {selectedMulligan.length}/2</span>
                      </div>
                      <div className="game-context-actions">
                        <button style={btnS} onClick={() => { send({ action: 'mulligan', card_indices: selectedMulligan }); setSelectedMulligan([]); }}>멀리건 실행</button>
                        <button style={{ ...btnS, background: '#1a2342' }} onClick={() => { send({ action: 'skip_mulligan' }); setSelectedMulligan([]); }}>스킵</button>
                      </div>
                    </div>
                )}

                {fieldSkills.length > 0 && (
                    <div className="game-context-panel">
                      <div className="game-context-head game-context-head-wrap">
                        <span className="game-toolbar-title">{selectedMyFieldCard!.name}</span>
                        <span className="game-context-subtext">사용할 스킬을 고르세요{selectedHeroKey === 'sojourn' ? ` · 현재 차징 ${selectedChargeLevel}/3` : ''}</span>
                      </div>
                      <div className="game-context-actions game-context-actions-wrap">
                        {fieldSkills.map(sk => (
                            <button
                                key={sk.key}
                                disabled={sk.onCooldown}
                                onClick={() => {
                                  const caster = selectedMyFieldCard!;
                                  const rawSkillName = getSkillNameFromCard(caster, sk.key);

                                  if (isTargetlessSkill(caster, sk.key)) {
                                    setActionMode(null);
                                    setColumnChoice(null);
                                    send({ action: 'use_skill', caster_uid: caster.uid, skill_key: sk.key });
                                    addLog(`${caster.name} — ${rawSkillName} 즉시 사용`);
                                    showSystemNotice(rawSkillName, `${caster.name} 사용`, 900);
                                    setSelectedFieldUid(null);
                                    return;
                                  }

                                  if (needsColumnSelector(caster, sk.key)) {
                                    const chargeLevel = getChargeLevel(caster);
                                    if (chargeLevel <= 0) {
                                      addLog('차징샷은 차징 1단계 이상 필요');
                                      showSystemNotice('차징 부족', '레일건으로 먼저 충전하세요', 1200);
                                      return;
                                    }
                                    setActionMode(null);
                                    setColumnChoice({ source: 'skill', heroKey: getHeroKey(caster), skillKey: sk.key, skillName: rawSkillName });
                                    addLog(`${caster.name} — ${rawSkillName} 열 선택`);
                                    showSystemNotice(rawSkillName, '열을 선택하세요', 1000);
                                    return;
                                  }

                                  setColumnChoice(null);
                                  setActionMode(sk.key);
                                  addLog(`${selectedMyFieldCard!.name} — ${rawSkillName} 준비`);
                                  showSystemNotice(rawSkillName, `${selectedMyFieldCard!.name} 준비`, 900);
                                }}
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
                        <button onClick={() => { setSelectedFieldUid(null); setActionMode(null); setColumnChoice(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
                      </div>
                      {actionMode && actionMode !== 'spell' && <div className="game-context-subtext">→ 아군 또는 상대 카드를 클릭</div>}
                    </div>
                )}

                {columnChoice && (
                    <div className="game-context-panel mercy-panel">
                      <div className="game-context-head game-context-head-wrap">
                        <span className="game-toolbar-title">{columnChoice.skillName} 열 선택</span>
                        <span className="game-context-subtext">세로줄 단위로 적용됩니다. 원하는 열을 선택하세요.</span>
                      </div>

                      {enemyColumns.length > 0 ? (
                          <div className="mercy-choice-grid">
                            {enemyColumns.map((col) => (
                                <button
                                    key={col.key}
                                    className="mercy-choice-card spell"
                                    onClick={() => {
                                      if (columnChoice.source === 'spell' && pendingSpell) {
                                        send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: col.repUid });
                                        addLog(`${columnChoice.skillName} → ${col.label}`);
                                      } else if (columnChoice.source === 'skill' && selectedMyFieldCard && columnChoice.skillKey) {
                                        send({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: columnChoice.skillKey, target_uid: col.repUid });
                                        addLog(`${selectedMyFieldCard.name} → ${col.label} (${columnChoice.skillName})`);
                                      }
                                      showSystemNotice(columnChoice.skillName, `${col.label} 선택`, 1200);
                                      setColumnChoice(null);
                                      setActionMode(null);
                                      setPendingSpell(null);
                                      setPendingSpellName(null);
                                      setSelectedHandIdx(null);
                                    }}
                                >
                                  <span className="mercy-choice-name">{col.label}</span>
                                  <span className="mercy-choice-role spell">{col.names.join(' · ')}</span>
                                </button>
                            ))}
                          </div>
                      ) : (
                          <div className="game-context-subtext">선택할 수 있는 적 열이 없습니다.</div>
                      )}

                      <div className="game-context-actions">
                        <button onClick={() => { setColumnChoice(null); setPendingSpell(null); setPendingSpellName(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
                      </div>
                    </div>
                )}

                {actionMode === 'spell' && pendingSpell && (
                    <div className="game-context-panel">
                      <div className="game-context-head">
                        <span className="game-toolbar-title">{pendingSpellName || '스킬 카드'} 대상 선택</span>
                        <span className="game-context-subtext">→ 적용할 카드를 클릭</span>
                      </div>
                      <div className="game-context-actions">
                        <button onClick={() => { setActionMode(null); setPendingSpell(null); setPendingSpellName(null); }} style={{ ...btnS, background: '#1a2342' }}>취소</button>
                      </div>
                    </div>
                )}

                {pendingSpellChoice?.type === 'spell_rescue_select' && (
                    <div className="game-context-panel mercy-panel">
                      <div className="game-context-head game-context-head-wrap">
                        <span className="game-toolbar-title">구원의 손길</span>
                        <span className="game-context-subtext">TRASH에서 가져올 카드를 하나 선택하세요.</span>
                      </div>

                      {(pendingSpellChoice.options || []).length > 0 ? (
                          <div className="mercy-choice-grid">
                            {(pendingSpellChoice.options || []).map((opt: any) => (
                                <button
                                    key={`trash-${opt.index}`}
                                    className={`mercy-choice-card ${roleClass(opt.is_spell ? 'spell' : opt.role)}`}
                                    onClick={() => {
                                      setLocalPendingSpellChoice(null);
                                      send({ action: 'execute_spell', hero_key: pendingSpellChoice.hero_key, trash_index: opt.index });
                                    }}
                                >
                                  <span className="mercy-choice-name">{opt.name}</span>
                                  <span className={`mercy-choice-role ${roleClass(opt.is_spell ? 'spell' : opt.role)}`}>{roleLabel(opt.is_spell ? 'spell' : opt.role)}</span>
                                </button>
                            ))}
                          </div>
                      ) : (
                          <div className="game-context-subtext">TRASH에 가져올 카드가 없습니다.</div>
                      )}
                    </div>
                )}

                {pendingSpellChoice?.type === 'spell_maximilian_select' && (
                    <div className="game-context-panel mercy-panel">
                      <div className="game-context-head game-context-head-wrap">
                        <span className="game-toolbar-title">막시밀리앙</span>
                        <span className="game-context-subtext">덱에서 가져올 카드를 하나 선택하세요.</span>
                      </div>

                      {(pendingSpellChoice.options || []).length > 0 ? (
                          <div className="mercy-choice-grid">
                            {(pendingSpellChoice.options || []).map((opt: any) => (
                                <button
                                    key={`draw-${opt.index}`}
                                    className={`mercy-choice-card ${roleClass(opt.is_spell ? 'spell' : opt.role)}`}
                                    onClick={() => {
                                      setLocalPendingSpellChoice(null);
                                      send({ action: 'execute_spell', hero_key: pendingSpellChoice.hero_key, draw_index: opt.index });
                                    }}
                                >
                                  <span className="mercy-choice-name">{opt.name}</span>
                                  <span className={`mercy-choice-role ${roleClass(opt.is_spell ? 'spell' : opt.role)}`}>{roleLabel(opt.is_spell ? 'spell' : opt.role)}</span>
                                </button>
                            ))}
                          </div>
                      ) : (
                          <div className="game-context-subtext">덱에 가져올 카드가 없습니다.</div>
                      )}
                    </div>
                )}

                {phase === 'placement' && is_my_turn && selectedHandCard?.is_spell && !pendingSpell && (
                    <div className="game-context-panel">
                      <div className="game-context-head">
                        <span className="game-toolbar-title">{selectedHandCard.name}</span>
                        <span className="game-context-subtext">스킬 카드를 바로 사용합니다</span>
                      </div>
                      <div className="game-context-actions">
                        <button onClick={() => handlePlace('main')} style={btnS}>✦ 스킬 카드 사용</button>
                        <button onClick={() => setSelectedHandIdx(null)} style={{ ...btnS, background: '#1a2342' }}>취소</button>
                      </div>
                    </div>
                )}

                {pendingPassive?.type === 'mercy_resurrect' && (
                    <div className="game-context-panel mercy-panel">
                      <div className="game-context-head game-context-head-wrap">
                        <span className="game-toolbar-title">메르시 부활 대상 선택</span>
                        <span className="game-context-subtext">
                    트래시에서 한 장을 선택하면 자동으로 배치 가능한 줄에 소생합니다.
                  </span>
                      </div>

                      {(pendingPassive.options || []).length > 0 ? (
                          <div className="mercy-choice-grid">
                            {(pendingPassive.options || []).map((opt: any) => (
                                <button
                                    key={opt.index}
                                    className={`mercy-choice-card ${roleClass(opt.role)}`}
                                    onClick={() => {
                                      setLocalPendingPassive(null);
                                      send({ action: 'resolve_passive_choice', trash_index: opt.index });
                                    }}
                                >
                                  <span className="mercy-choice-name">{opt.name}</span>
                                  <span className={`mercy-choice-role ${roleClass(opt.role)}`}>{roleLabel(opt.role)}</span>
                                </button>
                            ))}
                          </div>
                      ) : (
                          <div className="game-context-subtext">부활 가능한 트래시 카드가 없습니다.</div>
                      )}

                      <div className="game-context-actions">
                        <button onClick={() => { setLocalPendingPassive(null); send({ action: 'resolve_passive_choice', skip: true }); }} style={{ ...btnS, background: '#1a2342' }}>건너뛰기</button>
                      </div>
                    </div>
                )}

                {pendingPassive?.type === 'jetpack_cat_extra_place' && (
                    <div className="game-context-panel">
                      <div className="game-context-head game-context-head-wrap">
                        <span className="game-toolbar-title">제트팩 캣 추가 배치</span>
                        <span className="game-context-subtext">손패 영웅 카드를 고른 뒤 빈 자리를 눌러 추가 배치하세요.</span>
                      </div>
                      <div className="game-context-actions">
                        <button onClick={() => { setSelectedHandIdx(null); setLocalPendingPassive(null); send({ action: 'resolve_passive_choice', skip: true }); }} style={{ ...btnS, background: '#1a2342' }}>건너뛰기</button>
                      </div>
                    </div>
                )}
              </div>
          )}

          <div className="game-hand-row">
            {my.hand.map((card, i) => (
                <HandCardComp
                    key={`${card.id}-${i}`}
                    card={card}
                    selected={phase === 'mulligan' ? selectedMulligan.includes(i) : selectedHandIdx === i}
                    onClick={() => handleHandClick(card, i)}
                />
            ))}
          </div>

          <div className="game-bottombar">
            <span className="game-bottombar-meta">패:{my.hand_count} · 덱:{my.draw_pile_count} · 트래시:{my.trash_count}</span>
            <div className="game-bottombar-actions">
              {phase === 'placement' && <span className="game-placement-meta">배치 {my.placement_cost_used}/2</span>}
              {phase !== 'mulligan' && (
                  <button
                      className="game-endturn"
                      disabled={!is_my_turn || !!pendingPassive || !!pendingSpellChoice || !!columnChoice}
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
                        opacity: (is_my_turn && !pendingPassive && !pendingSpellChoice && !columnChoice) ? 1 : 0.5,
                      }}
                  >
                    {phase === 'placement' ? '배치 완료' : phase === 'action' ? '턴 종료' : '대기'}
                  </button>
              )}
            </div>
          </div>

          <div className="game-log">
            {logs.map((l, i) => (
                <div key={i} className="game-log-line">{l}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>

        <CardDetail card={detailCard} onClose={() => setDetailCard(null)} />
      </div>
  );
};

export default GamePage;