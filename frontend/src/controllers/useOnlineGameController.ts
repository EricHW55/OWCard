import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldCard, GameState, HandCard, KillFeedItem } from '../types/game';
import { GameSocket, buildWsUrl } from '../api/ws';
import useAnnouncerQueue from '../hooks/useAnnouncerQueue';
import { decodeJwt, normalizeErrorMessage, phaseLabel, phaseSubtitle } from '../utils/ui';

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

type KillSide = 'my' | 'opponent';

function findFieldCardByUid(state: any, uid?: string | null) {
  if (!state || !uid) return null;
  const cards = [...(state?.field?.main || []), ...(state?.field?.side || [])];
  return cards.find((c: any) => c?.uid === uid) || null;
}

function getSession() {
  const token = sessionStorage.getItem('access_token');
  const pid = sessionStorage.getItem('player_id');
  if (!token || !pid) return null;
  const decoded = decodeJwt(token);
  return { token, player_id: Number(pid), username: sessionStorage.getItem('username') || decoded?.username || `p${pid}` };
}

function getHeroKey(card: any): string {
  return String(card?.hero_key || card?.extra?._hero_key || '').toLowerCase();
}

function getChargeLevel(card: any): number {
  const raw = card?.extra?.charge_level;
  return typeof raw === 'number' ? raw : Number(raw || 0);
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
      const match = key.match(/(\d+)/);
      return match ? Number(match[1]) : 999;
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
  const hasSkillSignal = action === 'use_skill' || action === 'execute_spell' || !!msg?.skill_name || !!result?.skill_name || !!result?.skill || result?.type === 'spell_played';
  if (!hasSkillSignal) return null;

  const actorName = msg?.caster_name || msg?.actor_name || msg?.card_name || result?.caster?.name || result?.card?.name || '상대';
  const skillName = msg?.skill_name || result?.skill_name || result?.skill || result?.display_name || result?.card?.skill_name || result?.card?.name;
  if (!skillName) return null;

  const isSpell = action === 'execute_spell' || result?.type === 'spell_played' || !!result?.card?.is_spell || String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').startsWith('spell_');
  const oppField = opponentState ? [...(opponentState?.field?.main || []), ...(opponentState?.field?.side || [])] : [];
  const actorCard = oppField.find((c: any) => c.uid === msg?.caster_uid) || oppField.find((c: any) => c.name === actorName) || result?.caster || null;
  const spellCard = result?.card || { hero_key: result?.hero_key || msg?.hero_key, name: skillName, is_spell: true, description: result?.description };
  const heroKey = (isSpell ? (result?.hero_key || msg?.hero_key || spellCard?.hero_key) : getHeroKey(actorCard)) || result?.caster?.hero_key || result?.card?.hero_key || undefined;
  const description = isSpell
    ? getSkillDescriptionFromCard(spellCard, result?.skill_key || result?.skill || skillName)
    : getSkillDescriptionFromCard(actorCard, msg?.skill_key || result?.skill_key || result?.skill_name || result?.skill || skillName);

  return { title: skillName, subtitle: `${actorName} 사용`, heroKey, imageName: isSpell ? (spellCard?.name || skillName) : (actorCard?.name || actorName), isSpell, description };
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
  if (hero === 'domina' && skillKey === 'skill_2') return true;
  if (hero === 'roadhog' && skillKey === 'skill_2') return true;
  if (hero === 'torbjorn' && skillKey === 'skill_2') return true;
  return false;
}

function needsColumnSelector(card: any, skillKey?: string | null): boolean {
  const hero = getHeroKey(card);
  return hero === 'sojourn' && skillKey === 'skill_2';
}

function getHeroSkillBlockReason(card: any, skillKey: string): string | null {
  const hero = getHeroKey(card);
  const statuses = card?.statuses || [];
  const hasStatus = (name: string) => statuses.some((s: any) => s?.name === name);
  const extra = card?.extra || {};

  if (hero === 'bastion' && skillKey === 'skill_1' && extra?.last_mode === 'assault') return '설정: 강습은 연속 사용 불가 (수색 먼저)';
  if (hero === 'venture' && skillKey === 'skill_1' && extra?.used_burrow_last) return '잠복은 연속 사용 불가';
  if (hero === 'venture' && skillKey === 'skill_2' && hasStatus('burrowed')) return '잠복 상태에서는 스마트 굴착기 사용 불가';
  if (hero === 'freja' && skillKey === 'skill_2' && !hasStatus('airborne')) return '정조준은 에어본 상태에서만 사용 가능';
  if (hero === 'ramattra' && skillKey === 'skill_3' && extra?.form !== 'nemesis') return '막기는 네메시스 폼에서만 사용 가능';
  if (hero === 'roadhog' && skillKey === 'skill_2' && Number(card?.current_hp || 0) > Number(extra?.heal_threshold ?? 15)) {
    return `숨돌리기는 체력 ${extra?.heal_threshold ?? 15} 이하에서만 사용 가능`;
  }
  return null;
}

function buildColumnChoices(field: any): ColumnPreview[] {
  const main = Array.isArray(field?.main) ? field.main : [];
  const side = Array.isArray(field?.side) ? field.side : [];
  const mainTanks = main.filter((c: any) => c?.role === 'tank');
  const mainDealers = main.filter((c: any) => c?.role === 'dealer');
  const mainHealers = main.filter((c: any) => c?.role === 'healer');
  const previews: ColumnPreview[] = [];

  const leftMembers = [mainTanks[0], mainDealers[0], mainHealers[0]].filter(Boolean);
  if (leftMembers.length > 0) previews.push({ key: 'main_left', label: '본대 좌열', repUid: leftMembers[0].uid, names: leftMembers.map((c: any) => c.name) });

  const rightMembers = [mainDealers[1], mainHealers[1]].filter(Boolean);
  if (rightMembers.length > 0) previews.push({ key: 'main_right', label: '본대 우열', repUid: rightMembers[0].uid, names: rightMembers.map((c: any) => c.name) });

  if (side.length > 0) previews.push({ key: 'side', label: '사이드 열', repUid: side[0].uid, names: side.map((c: any) => c.name) });
  return previews;
}

function collectFatalUids(node: any, found = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return found;
  const uid = node?.target || node?.uid;
  const remainingHp = node?.remaining_hp;
  if (uid && typeof remainingHp === 'number' && remainingHp <= 0) found.add(String(uid));
  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') collectFatalUids(value, found);
  });
  return found;
}

export function useOnlineGameController(gameId: string) {
  const session = useMemo(() => getSession(), []);
  const { announcerData, enqueueAnnouncer, closeAnnouncer } = useAnnouncerQueue();

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
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);


  const wsRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const phaseStampRef = useRef('');
  const gsRef = useRef<GameState | null>(null);
  const pendingSpellNameRef = useRef<string | null>(null);
  const pendingKillContextRef = useRef<{
    killerName: string;
    killerHeroKey?: string;
    killerIsSpell?: boolean;
    killerTeam: KillSide;
    victimTeam: KillSide;
    createdAt: number;
    fatalUids: string[];
  } | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-39), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const showPhaseChange = useCallback((phaseName: string, phaseSub: string, duration = 1800) => {
    enqueueAnnouncer({ type: 'phase', title: phaseName, subtitle: phaseSub, duration });
  }, [enqueueAnnouncer]);

  const showSystemNotice = useCallback((title: string, subtitle?: string, duration = 1300) => {
    if (!title) return;
    enqueueAnnouncer({ type: 'phase', title, subtitle, duration });
  }, [enqueueAnnouncer]);

  const showSkillUse = useCallback((props: {
    skillName: string;
    description?: string;
    heroKey?: string;
    imageName?: string;
    subtitle?: string;
    isSpell?: boolean;
    duration?: number;
  }) => {
    if (!props.skillName) return;
    enqueueAnnouncer({ type: 'skill', title: props.skillName, description: props.description || '', heroKey: props.heroKey || '', imageName: props.imageName, subtitle: props.subtitle, isSpell: props.isSpell || false, duration: props.duration || 3200 });
  }, [enqueueAnnouncer]);

  const pushKillFeedByUids = useCallback((uids: string[], nextState: any) => {
    const context = pendingKillContextRef.current;
    if (!context || uids.length === 0) return;
    const prev = gsRef.current;
    if (!prev) return;
    const prevAllCards = [
      ...(prev?.my_state?.field?.main || []),
      ...(prev?.my_state?.field?.side || []),
      ...(prev?.opponent_state?.field?.main || []),
      ...(prev?.opponent_state?.field?.side || []),
    ];
    const nextAllCards = [
      ...(nextState?.my_state?.field?.main || []),
      ...(nextState?.my_state?.field?.side || []),
      ...(nextState?.opponent_state?.field?.main || []),
      ...(nextState?.opponent_state?.field?.side || []),
    ];
    const nextAlive = new Set(nextAllCards.map((card: any) => card.uid));
    const victimCards = uids
        .map((uid) => prevAllCards.find((card: any) => card.uid === uid))
        .filter((card: any) => !!card && !nextAlive.has(card.uid));

    if (victimCards.length === 0) return;

    setKillFeed((prevFeed) => {
      const createdAt = Date.now();
      const items = victimCards.map((victim: any, idx: number): KillFeedItem => ({
        id: `${createdAt}-${victim.uid}-${idx}`,
        killer: {
          name: context.killerName,
          hero_key: context.killerHeroKey,
          is_spell: context.killerIsSpell,
          team: context.killerTeam,
        },
        victim: {
          name: victim.name || '영웅',
          hero_key: getHeroKey(victim),
          is_spell: !!victim?.is_spell,
          team: context.victimTeam,
        },
        createdAt: createdAt + idx,
        duration: 3000,
      }));
      return [...items, ...prevFeed].slice(0, 6);
    });
  }, []);

  const dismissKillFeedItem = useCallback((id: string) => {
    setKillFeed((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showPassiveNoticeFromLog = useCallback((entry: any, owner: 'my' | 'opponent') => {
    if (!entry) return;
    const ownerState = owner === 'my' ? gsRef.current?.my_state : gsRef.current?.opponent_state;
    const allCards = [...(ownerState?.field?.main || []), ...(ownerState?.field?.side || [])];
    const sourceCard = allCards.find((c: any) => c.uid === entry?.source_uid);
    const sourceName = sourceCard?.name || entry?.source_name || (owner === 'my' ? '아군' : '상대');
    const sourceHeroKey = getHeroKey(sourceCard);

    if (entry?.type === 'turn_start_passive' && entry?.result?.passive) {
      showSkillUse({ skillName: entry.result.passive, subtitle: `${sourceName} 패시브`, description: entry?.result?.message || '', heroKey: sourceHeroKey, imageName: sourceName, isSpell: false, duration: 3000 });
      return;
    }

    if (entry?.type === 'auto_turret') {
      showSystemNotice('포탑 자동 공격', sourceName, 1400);
      return;
    }
    if (entry?.type === 'auto_heal') showSystemNotice('자동 치유', sourceName, 1400);
  }, [showSkillUse, showSystemNotice]);

  const showDeathPassiveNotice = useCallback((result: any, owner: 'my' | 'opponent') => {
    const gsNow = gsRef.current;
    if (!gsNow || !result) return;

    const ownerCards = owner === 'my'
      ? [...(gsNow.my_state?.field?.main || []), ...(gsNow.my_state?.field?.side || [])]
      : [...(gsNow.opponent_state?.field?.main || []), ...(gsNow.opponent_state?.field?.side || [])];
    const allCards = [ ...(gsNow.my_state?.field?.main || []), ...(gsNow.my_state?.field?.side || []), ...(gsNow.opponent_state?.field?.main || []), ...(gsNow.opponent_state?.field?.side || []) ];
    const seen = new Set<string>();
    const queue: any[] = [result];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      const isDeathPassive = !!(node?.death_prevented || node?.prevent_death || node?.transform || node?.enter_frozen);
      if (isDeathPassive) {
        const key = `${node?.by || ''}:${node?.target || node?.uid || ''}:${node?.transform || ''}:${node?.enter_frozen ? 1 : 0}`;
        if (!seen.has(key)) {
          seen.add(key);
          const sourceUid = node?.target || node?.uid || node?.source_uid;
          const sourceCard = ownerCards.find((c: any) => c.uid === sourceUid) || allCards.find((c: any) => c.uid === sourceUid);
          const sourceName = sourceCard?.name || (owner === 'my' ? '아군' : '상대');

          if (node?.by === 'mech_destruction' || node?.transform === 'hana_song') {
            showSkillUse({ skillName: '긴급 탈출', subtitle: `${sourceName} 패시브`, description: '메카 파괴 시 송하나 형태로 전환합니다.', heroKey: getHeroKey(sourceCard) || 'dva', imageName: sourceCard?.name || sourceName, isSpell: false, duration: 2600 });
          } else if (node?.by === 'frozen_revive' || node?.enter_frozen) {
            showSkillUse({ skillName: '급속 빙결', subtitle: `${sourceName} 패시브`, description: '치명 피해 시 빙결 상태가 되고 다음 턴 시작에 회복합니다.', heroKey: getHeroKey(sourceCard) || 'mei', imageName: sourceCard?.name || sourceName, isSpell: false, duration: 2600 });
          } else {
            showSystemNotice(sourceName, '사망 패시브 발동', 1200);
          }
        }
      }
      Object.values(node).forEach((value) => { if (value && typeof value === 'object') queue.push(value); });
    }
  }, [showSkillUse, showSystemNotice]);

  useEffect(() => { gsRef.current = gs; }, [gs]);
  useEffect(() => { pendingSpellNameRef.current = pendingSpellName; }, [pendingSpellName]);

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
      offFns.forEach((off) => { try { off(); } catch {} });
      offFns = [];
      clearHeartbeat();
      if (localWs) { try { localWs.disconnect(); } catch {} localWs = null; }
      wsRef.current = null;
    };
    const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatRef.current = window.setInterval(() => {
        if (wsRef.current?.connected) {
          try { wsRef.current.send({ action: 'ping' }); } catch {}
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
          if (pendingKillContextRef.current?.createdAt) {
            const pendingUids = pendingKillContextRef.current.fatalUids || [];
            if (pendingUids.length > 0) pushKillFeedByUids(pendingUids, msg.state);
            pendingKillContextRef.current = null;
          }
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
          const myCasterCard = findFieldCardByUid(latestMyState, msg?.caster_uid) || result?.caster || null;
          const spellName = result?.card?.name || result?.skill_name || result?.skill || myHand.find((c: any) => c.hero_key === result?.hero_key)?.name || pendingSpellNameRef.current || '스킬 카드';
          const actorName = myCasterCard?.name || result?.caster_name || result?.caster?.name || result?.card?.name || '영웅';
          const resolvedSkillName = result?.skill_name || result?.skill || null;
          const fatalUids = Array.from(collectFatalUids(result));
          const isSpellKill = msg.action === 'execute_spell' || !!result?.card?.is_spell || String(result?.hero_key || '').startsWith('spell_');
          const killHeroKey = isSpellKill
              ? (result?.hero_key || result?.card?.hero_key || '')
              : (getHeroKey(myCasterCard) || result?.caster?.hero_key || '');
          pendingKillContextRef.current = {
            killerName: actorName,
            killerHeroKey: killHeroKey,
            killerIsSpell: isSpellKill,
            killerTeam: 'my',
            victimTeam: 'opponent',
            createdAt: Date.now(),
            fatalUids,
          };

          if (msg.action === 'place_card' && result?.type === 'card_placed' && result?.card && !result?.card?.is_spell) {
            const zoneLabel = result?.zone === 'side' ? '사이드' : '본대';
            showSystemNotice(result.card.name, `${zoneLabel} 배치`, 1200);
          }
          if (msg.action === 'resolve_passive_choice' && result?.type === 'card_placed' && result?.card && !result?.card?.is_spell) {
            const zoneLabel = result?.zone === 'side' ? '사이드' : '본대';
            showSystemNotice(result.card.name, `${zoneLabel} 추가 배치`, 1300);
          }
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
            showSkillUse({ skillName: resolvedSkillName || spellName, description: getSkillDescriptionFromCard(spellCard), heroKey: result?.hero_key || spellCard?.hero_key || '', imageName: spellCard?.name || spellName, isSpell: true, duration: 3200 });
            setLocalPendingSpellChoice(null);
          }

          if (result?.passive_triggered?.summoned) {
            addLog(`설치물 소환: ${result.passive_triggered.summoned.name}`);
            showSystemNotice(result.passive_triggered.summoned.name, '설치물 소환', 1300);
          }
          if (result?.passive_triggered?.passive) {
            showSkillUse({ skillName: result.passive_triggered.passive, subtitle: `${actorName} 패시브`, description: result?.passive_triggered?.message || '', heroKey: result?.caster?.hero_key || '', imageName: actorName, isSpell: false, duration: 3000 });
          }
          if (result?.passive_triggered?.needs_choice) {
            setLocalPendingPassive(result.passive_triggered.needs_choice);
            addLog('패시브 추가 선택 필요');
            if (result.passive_triggered.passive) showSystemNotice(result.passive_triggered.passive, '선택이 필요합니다', 1300);
          }
          if (msg.action === 'resolve_passive_choice') {
            setLocalPendingPassive(null);
            if (result?.card?.name) {
              addLog(`패시브 처리: ${result.card.name}`);
              showSystemNotice(result.card.name, '패시브 처리', 1300);
            }
          }

          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'my'));
          showDeathPassiveNotice(result, 'my');

          if (msg.action === 'use_skill' && resolvedSkillName) {
            const casterCard = myCasterCard;
            showSkillUse({ skillName: resolvedSkillName, description: getSkillDescriptionFromCard(casterCard, msg?.skill_key || result?.skill_key || result?.skill), heroKey: getHeroKey(casterCard), imageName: casterCard?.name, subtitle: result?.caster_name || casterCard?.name, isSpell: false, duration: 3200 });
          }
          if (msg.action === 'execute_spell') {
            setLocalPendingSpellChoice(null);
            if (resolvedSkillName) {
              const spellCard = myHand.find((c: any) => c.hero_key === result?.hero_key) || result?.card;
              showSkillUse({ skillName: resolvedSkillName, description: getSkillDescriptionFromCard(spellCard), heroKey: result?.hero_key || spellCard?.hero_key || '', imageName: spellCard?.name || resolvedSkillName, isSpell: true, duration: 3200 });
            }
          }
          if (msg.action === 'execute_spell' && result?.rescued) showSystemNotice(result.rescued, 'TRASH → 패', 1400);
          if (msg.action === 'execute_spell' && result?.drawn_card) showSystemNotice(result.drawn_card, '덱 → 패', 1400);
        }),
        ws.on('opponent_action', (msg: any) => {
          addLog(`상대: ${msg.action}`);
          const cue = buildOpponentSkillCue(msg, gsRef.current?.opponent_state);
          if (cue) showSkillUse({ skillName: cue.title, description: cue.description || '', heroKey: cue.heroKey || '', imageName: cue.imageName, subtitle: cue.subtitle, isSpell: !!cue.isSpell, duration: 3200 });
          const result = msg?.result || {};
          const oppState = gsRef.current?.opponent_state as any;
          const opponentCasterCard = findFieldCardByUid(oppState, msg?.caster_uid) || result?.caster || null;
          const opponentName = opponentCasterCard?.name || result?.caster_name || cue?.subtitle?.replace(/ 사용$/, '') || '상대';
          const fatalUids = Array.from(collectFatalUids(result));
          const isSpellKill = cue?.isSpell || msg.action === 'execute_spell' || !!result?.card?.is_spell || String(result?.hero_key || '').startsWith('spell_');
          const killHeroKey = isSpellKill
              ? (cue?.heroKey || result?.hero_key || result?.card?.hero_key || '')
              : (getHeroKey(opponentCasterCard) || result?.caster?.hero_key || '');
          pendingKillContextRef.current = {
            killerName: opponentName,
            killerHeroKey: killHeroKey,
            killerIsSpell: isSpellKill,
            killerTeam: 'opponent',
            victimTeam: 'my',
            createdAt: Date.now(),
            fatalUids,
          };
          if (result?.passive_triggered?.passive) showSkillUse({ skillName: result.passive_triggered.passive, subtitle: '상대 패시브', description: result?.passive_triggered?.message || '', heroKey: result?.caster?.hero_key || '', imageName: result?.caster_name || '상대', isSpell: false, duration: 3000 });
          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'opponent'));
          showDeathPassiveNotice(result, 'opponent');
        }),
        ws.on('phase_change', (msg: any) => addLog(msg.message || `페이즈: ${msg.phase}`)),
        ws.on('game_over', (msg: any) => {
          // addLog(`게임 종료! 승자: ${msg.winner_name ?? msg.winner}`);
          const isWinner = Number(msg?.winner) === Number(session.player_id);
          addLog(`게임 종료! ${isWinner ? '승리' : '패배'} · 승자: ${msg.winner_name ?? msg.winner}`);
          setReconnecting(false);
          // showPhaseChange('게임 종료', `${msg.winner_name ?? msg.winner ?? '승자 미정'}`, 2000);
          showPhaseChange(isWinner ? '승리' : '패배', `${msg.winner_name ?? msg.winner ?? '승자 미정'}`, 2800);
        }),
        ws.on('opponent_disconnected', () => addLog('상대 연결 끊김')),
        ws.on('player_reconnected', () => addLog('상대가 재연결했습니다')),
        ws.on('error', (msg: any) => {
          const shortMessage = normalizeErrorMessage(msg?.message);
          addLog(`오류: ${shortMessage}`);
          showSystemNotice('행동 불가', shortMessage, 2600);
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
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      offFns.forEach((off) => { try { off(); } catch {} });
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (localWs) { try { localWs.disconnect(); } catch {} }
      wsRef.current = null;
    };
  }, [session, gameId, addLog, showPhaseChange, showSkillUse, showSystemNotice, showPassiveNoticeFromLog, showDeathPassiveNotice, pushKillFeedByUids]);

  const send = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current?.connected) { wsRef.current.send(data); return; }
    addLog('전송 실패(미연결)');
  }, [addLog]);

  const leaveGame = useCallback(() => {
    manualCloseRef.current = true;
    if (gs && gs.phase !== 'game_over') send({ action: 'leave_game' });
  }, [gs, send]);

  const surrenderGame = useCallback(() => {
    if (gs && gs.phase !== 'game_over') send({ action: 'surrender' });
  }, [gs, send]);

  const my = gs?.my_state || null;
  const opp = gs?.opponent_state || null;
  const phase = gs?.phase || 'loading';
  const isMyTurn = !!gs?.is_my_turn;

  const pendingPassive = ((my as any)?.pending_passive ?? (my as any)?.pendingPassive ?? (gs as any)?.my_state?.pending_passive ?? localPendingPassive ?? null) as any;
  const pendingSpellChoice = ((my as any)?.pending_spell ?? (my as any)?.pendingSpell ?? (gs as any)?.my_state?.pending_spell ?? localPendingSpellChoice ?? null) as any;

  const selectedHandCard = selectedHandIdx !== null && my ? my.hand[selectedHandIdx] : null;
  const allMyField = my ? [...my.field.main, ...my.field.side] : [];
  const selectedMyFieldCard = allMyField.find((c) => c.uid === selectedFieldUid) || null;
  const enemyColumns = buildColumnChoices(opp?.field);
  const selectedHeroKey = getHeroKey(selectedMyFieldCard);
  const selectedChargeLevel = getChargeLevel(selectedMyFieldCard);
  const canActUids = (phase === 'action' && isMyTurn) ? allMyField.filter((c) => !c.placed_this_turn && !c.acted_this_turn).map((c) => c.uid) : [];

  const fieldSkills: { key: string; name: string; onCooldown: boolean; cdLeft: number }[] = [];
  if (selectedMyFieldCard && !selectedMyFieldCard.placed_this_turn && !selectedMyFieldCard.acted_this_turn && phase === 'action' && isMyTurn) {
    const meta = selectedMyFieldCard.skill_meta || {};
    const cds = selectedMyFieldCard.skill_cooldowns || {};
    const heroKey = getHeroKey(selectedMyFieldCard);
    const chargeLevel = getChargeLevel(selectedMyFieldCard);
    for (const [key, m] of Object.entries(meta)) {
      if (!key.startsWith('skill_')) continue;
      let displayName = (m as any)?.name || key;
      if (heroKey === 'sojourn' && key === 'skill_2') displayName = `${displayName} [${chargeLevel}단계]`;
      fieldSkills.push({ key, name: displayName, onCooldown: (cds[key] ?? 0) > 0, cdLeft: cds[key] ?? 0 });
    }
    fieldSkills.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }

  const showContextPanel = (!!my && phase === 'mulligan' && !my.mulligan_done) || fieldSkills.length > 0 || (actionMode === 'spell' && !!pendingSpell) || (phase === 'placement' && isMyTurn && !!selectedHandCard?.is_spell && !pendingSpell) || !!columnChoice || pendingPassive?.type === 'mercy_resurrect' || pendingPassive?.type === 'jetpack_cat_extra_place' || !!pendingSpellChoice;

  const handleHandClick = useCallback((card: HandCard, index: number) => {
    if (!my) return;
    if (phase === 'mulligan') {
      setSelectedMulligan((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].slice(0, 2));
      return;
    }
    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      if (card.is_spell) { addLog('스킬 카드는 추가 배치할 수 없음'); return; }
      if (selectedHandIdx === index) { setSelectedHandIdx(null); return; }
      setSelectedHandIdx(index); setSelectedFieldUid(null); setActionMode(null); setPendingSpell(null); setPendingSpellName(null); return;
    }
    if (selectedHandIdx === index) {
      setDetailCard(card); setSelectedHandIdx(null); setActionMode(null); setColumnChoice(null); return;
    }
    setSelectedHandIdx(index); setSelectedFieldUid(null); setActionMode(null); setPendingSpell(null); setPendingSpellName(null);
  }, [my, phase, pendingPassive, selectedHandIdx, addLog]);

  const handleFieldClick = useCallback((card: FieldCard, isOpponent: boolean) => {
    if (columnChoice) { addLog('위 패널에서 열을 선택하세요'); return; }
    if (actionMode === 'spell' && pendingSpell) {
      send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: card.uid });
      addLog(`스킬 카드 → ${card.name}`);
      showSystemNotice(pendingSpellName || '스킬 카드', `${card.name} 대상`, 1200);
      setActionMode(null); setPendingSpell(null); setPendingSpellName(null); setColumnChoice(null); setSelectedHandIdx(null); return;
    }
    if (actionMode && actionMode !== 'spell' && selectedFieldUid) {
      const caster = allMyField.find((c) => c.uid === selectedFieldUid);
      if (caster) {
        const skillName = getSkillNameFromCard(caster, actionMode);
        send({ action: 'use_skill', caster_uid: caster.uid, skill_key: actionMode, target_uid: card.uid });
        addLog(`${caster.name} → ${card.name} (${skillName})`);
        showSystemNotice(skillName, `${caster.name} 사용`, 900);
      }
      setSelectedFieldUid(null); setActionMode(null); return;
    }
    if (!isOpponent) {
      if (selectedFieldUid === card.uid) { setDetailCard(card); setSelectedFieldUid(null); }
      else { setSelectedFieldUid(card.uid); setSelectedHandIdx(null); setActionMode(null); setPendingSpell(null); setPendingSpellName(null); setColumnChoice(null); }
    } else setDetailCard(card);
  }, [columnChoice, actionMode, pendingSpell, pendingSpellName, selectedFieldUid, send, addLog, showSystemNotice, allMyField]);

  const handlePlace = useCallback((zone: 'main' | 'side') => {
    if (!my || selectedHandIdx === null || !isMyTurn || phase !== 'placement') return;
    const card = my.hand[selectedHandIdx];
    const myFieldCount = (my.field.main?.length || 0) + (my.field.side?.length || 0);
    const zoneLabel = zone === 'main' ? '본대' : '사이드';
    if (card.is_spell && myFieldCount === 0) {
      addLog('필드에 카드가 없어 스킬 카드를 먼저 사용할 수 없음');
      showSystemNotice('최소 배치 필요', '필드에 카드를 1장 이상 먼저 배치하세요', 1700);
      return;
    }
    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      send({ action: 'resolve_passive_choice', hand_index: selectedHandIdx, zone });
      addLog(`${card.name} → ${zoneLabel} 추가 배치`);
      setSelectedHandIdx(null);
      return;
    }
    send({ action: 'place_card', hand_index: selectedHandIdx, zone });
    addLog(`${card.name} → ${zoneLabel} ${card.is_spell ? '사용' : '배치'}`);
    setSelectedHandIdx(null);
  }, [my, selectedHandIdx, isMyTurn, phase, pendingPassive, send, addLog, showSystemNotice]);

  const prepareSkill = useCallback((skillKey: string) => {
    if (!selectedMyFieldCard) return;
    const caster = selectedMyFieldCard;
    const rawSkillName = getSkillNameFromCard(caster, skillKey);
    const blockReason = getHeroSkillBlockReason(caster, skillKey);
    if (blockReason) {
      addLog(`${caster.name} — ${rawSkillName} 불가 (${blockReason})`);
      showSystemNotice('행동 불가', blockReason, 1800);
      return;
    }
    if (isTargetlessSkill(caster, skillKey)) {
      setActionMode(null); setColumnChoice(null);
      send({ action: 'use_skill', caster_uid: caster.uid, skill_key: skillKey });
      addLog(`${caster.name} — ${rawSkillName} 즉시 사용`);
      showSystemNotice(rawSkillName, `${caster.name} 사용`, 900);
      setSelectedFieldUid(null);
      return;
    }
    if (needsColumnSelector(caster, skillKey)) {
      const chargeLevel = getChargeLevel(caster);
      if (chargeLevel <= 0) { addLog('차징샷은 차징 1단계 이상 필요'); showSystemNotice('차징 부족', '레일건으로 먼저 충전하세요', 1200); return; }
      setActionMode(null); setColumnChoice({ source: 'skill', heroKey: getHeroKey(caster), skillKey, skillName: rawSkillName });
      addLog(`${caster.name} — ${rawSkillName} 열 선택`);
      showSystemNotice(rawSkillName, '열을 선택하세요', 1000);
      return;
    }
    setColumnChoice(null); setActionMode(skillKey); addLog(`${caster.name} — ${rawSkillName} 준비`); showSystemNotice(rawSkillName, `${caster.name} 준비`, 900);
  }, [selectedMyFieldCard, send, addLog, showSystemNotice]);

  const runMulligan = useCallback(() => { send({ action: 'mulligan', card_indices: selectedMulligan }); setSelectedMulligan([]); }, [send, selectedMulligan]);
  const skipMulligan = useCallback(() => { send({ action: 'skip_mulligan' }); setSelectedMulligan([]); }, [send]);
  const selectColumn = useCallback((repUid: string, label: string) => {
    if (columnChoice?.source === 'spell' && pendingSpell) {
      send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: repUid });
      addLog(`${columnChoice.skillName} → ${label}`);
    } else if (columnChoice?.source === 'skill' && selectedMyFieldCard && columnChoice.skillKey) {
      send({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: columnChoice.skillKey, target_uid: repUid });
      addLog(`${selectedMyFieldCard.name} → ${label} (${columnChoice.skillName})`);
    }
    showSystemNotice(columnChoice?.skillName || '열 선택', `${label} 선택`, 1200);
    setColumnChoice(null); setActionMode(null); setPendingSpell(null); setPendingSpellName(null); setSelectedHandIdx(null);
  }, [columnChoice, pendingSpell, selectedMyFieldCard, send, addLog, showSystemNotice]);
  const cancelColumnChoice = useCallback(() => { setColumnChoice(null); setPendingSpell(null); setPendingSpellName(null); }, []);
  const cancelPendingSpell = useCallback(() => { setActionMode(null); setPendingSpell(null); setPendingSpellName(null); }, []);
  const useSelectedSpell = useCallback(() => { handlePlace('main'); }, [handlePlace]);
  const cancelSelectedHand = useCallback(() => { setSelectedHandIdx(null); }, []);
  const resolveMercy = useCallback((trashIndex: number) => { setLocalPendingPassive(null); send({ action: 'resolve_passive_choice', trash_index: trashIndex }); }, [send]);
  const skipMercy = useCallback(() => { setLocalPendingPassive(null); send({ action: 'resolve_passive_choice', skip: true }); }, [send]);
  const skipJetpackCat = useCallback(() => { setSelectedHandIdx(null); setLocalPendingPassive(null); send({ action: 'resolve_passive_choice', skip: true }); }, [send]);
  const resolveSpellChoice = useCallback((index: number, mode: 'trash' | 'draw') => {
    if (!pendingSpellChoice?.hero_key) return;
    setLocalPendingSpellChoice(null);
    if (mode === 'trash') { send({ action: 'execute_spell', hero_key: pendingSpellChoice.hero_key, trash_index: index }); return; }
    send({ action: 'execute_spell', hero_key: pendingSpellChoice.hero_key, draw_index: index });
  }, [pendingSpellChoice, send]);
  const handleEndMainButton = useCallback(() => {
    if (!gs) return;
    if (phase === 'placement') { send({ action: 'end_placement' }); addLog('배치 완료'); return; }
    if (phase === 'action') { send({ action: 'end_turn' }); addLog('턴 종료'); }
  }, [gs, phase, send, addLog]);

  return {
    session, gs, announcerData, closeAnnouncer, connected, reconnecting, logs, my, opp, phase, isMyTurn,
    selectedHandIdx, selectedMulligan, selectedFieldUid, selectedHandCard, selectedMyFieldCard, detailCard,
    actionMode, pendingSpell, pendingSpellName, pendingPassive, pendingSpellChoice, columnChoice, enemyColumns,
    selectedHeroKey, selectedChargeLevel, canActUids, fieldSkills, showContextPanel, killFeed, dismissKillFeedItem,
    handleHandClick, handleFieldClick, handlePlace, prepareSkill, runMulligan, skipMulligan,
    selectColumn, cancelColumnChoice, cancelPendingSpell, useSelectedSpell, cancelSelectedHand,
    resolveMercy, skipMercy, skipJetpackCat, resolveSpellChoice, handleEndMainButton, leaveGame, surrenderGame,
    setDetailCard, setSelectedFieldUid, setActionMode, setColumnChoice, setPendingSpell, setPendingSpellName,
  };
}

export default useOnlineGameController;
