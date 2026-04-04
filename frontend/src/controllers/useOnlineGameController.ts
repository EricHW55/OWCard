import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CardVisualEffect, FieldCard, GameState, HandCard, KillFeedItem } from '../types/game';
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
  return String(card?.hero_key || card?.extra?._hero_key || card?.id || '').toLowerCase().trim();
}

function getChargeLevel(card: any): number {
  const raw = card?.extra?.charge_level;
  return typeof raw === 'number' ? raw : Number(raw || 0);
}

function getSkillNameFromCard(card: any, skillKey?: string | null) {
  const heroKey = getHeroKey(card);
  if (heroKey === 'kiriko' && skillKey === 'skill_1') {
    return card?.zone === 'side' ? '쿠나이' : '힐부적';
  }
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

function buildOpponentSkillCue(msg: any, opponentState?: any, fallbackHeroKey?: string) {
  const result = msg?.result || {};
  const action = msg?.action;
  const hiddenInstallSpellKeys = new Set(['spell_immortality_field', 'spell_deflect']);
  const resultHeroKey = String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').toLowerCase();
  const isHiddenInstallSpell = hiddenInstallSpellKeys.has(resultHeroKey);

  // 불사장치/튕겨내기는 "설치 시점"에는 상대에게 완전히 숨겨야 한다.
  // (효과가 실제 발동될 때는 death/reflect 로그에서 별도로 UI를 띄운다.)
  if (isHiddenInstallSpell && (result?.type === 'spell_played' || action === 'execute_spell' || action === 'place_card')) {
    return null;
  }

  if (result?.hidden) return null;
  const hasSkillSignal = action === 'use_skill' || action === 'execute_spell' || !!msg?.skill_name || !!result?.skill_name || !!result?.skill || result?.type === 'spell_played';
  if (!hasSkillSignal) return null;

  const actorName = msg?.caster_name || result?.caster_name || msg?.actor_name || msg?.card_name || result?.caster?.name || result?.card?.name || '상대';
  const skillName = msg?.skill_name || result?.skill_name || result?.skill || result?.display_name || result?.card?.skill_name || result?.card?.name;
  if (!skillName) return null;

  const isSpell = action === 'execute_spell' || result?.type === 'spell_played' || !!result?.card?.is_spell || String(result?.hero_key || msg?.hero_key || result?.card?.hero_key || '').startsWith('spell_');
  const oppField = opponentState ? [...(opponentState?.field?.main || []), ...(opponentState?.field?.side || [])] : [];
  const actorCard = oppField.find((c: any) => c.uid === (msg?.caster_uid || result?.caster_uid)) || oppField.find((c: any) => c.name === actorName) || result?.caster || null;
  const spellCard = result?.card || { hero_key: result?.hero_key || msg?.hero_key, name: skillName, is_spell: true, description: result?.description };
  const heroKey = isSpell
    ? (result?.hero_key || msg?.hero_key || spellCard?.hero_key || undefined)
      : (getHeroKey(actorCard) || result?.caster_hero_key || fallbackHeroKey || getHeroKey(result?.caster) || undefined);
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

function getSymmetraTeleportBlockReason(caster: any, target: any, myField: any): string | null {
  if (getHeroKey(caster) !== 'symmetra') return null;
  if (!target || !myField) return '행동 불가';
  const role = String(target?.role || '');
  const nextZone = target?.zone === 'main' ? 'side' : 'main';
  const sideCards = Array.isArray(myField?.side) ? myField.side : [];
  if (nextZone === 'side') {
    const hasSameRoleInSide = sideCards.some((c: any) => c?.uid !== target?.uid && c?.alive !== false && c?.role === role);
    if (!hasSameRoleInSide) return null;
    if (role === 'tank') return '행동 불가: 사이드 자리가 꽉 찼습니다';
    return `행동 불가: 사이드 ${role} 자리가 꽉 찼습니다`;
  }
  const mainCards = Array.isArray(myField?.main) ? myField.main : [];
  const occupiedSlots = new Set(
      mainCards
          .filter((c: any) => c?.uid !== target?.uid && c?.role === role && c?.alive !== false)
          .map((c: any) => Number(c?.extra?.slot_index ?? 0)),
  );
  const isMainBlocked = role === 'tank'
      ? occupiedSlots.has(0)
      : occupiedSlots.has(0) && occupiedSlots.has(1);
  if (!isMainBlocked) return null;
  if (role === 'tank') return '행동 불가: 본대 탱커 자리가 꽉 찼습니다';
  return `행동 불가: 본대 ${role} 자리가 꽉 찼습니다`;
}

function buildColumnChoices(field: any): ColumnPreview[] {
  const main = Array.isArray(field?.main) ? field.main : [];
  const side = Array.isArray(field?.side) ? field.side : [];
  const mainTanks = main.filter((c: any) => c?.role === 'tank');
  const getByRoleAndSlot = (role: 'dealer' | 'healer', slot: 0 | 1) =>
      main.find((c: any) => c?.role === role && Number(c?.extra?.slot_index ?? 0) === slot) || null;
  const previews: ColumnPreview[] = [];
  const pickRepresentativeUid = (preferred: Array<any>) => preferred.find((c) => c?.uid)?.uid;
  const leftDealer = getByRoleAndSlot('dealer', 0);
  const rightDealer = getByRoleAndSlot('dealer', 1);
  const leftHealer = getByRoleAndSlot('healer', 0);
  const rightHealer = getByRoleAndSlot('healer', 1);

  const leftMembers = [mainTanks[0], leftDealer, leftHealer].filter(Boolean);
  const leftRepUid = pickRepresentativeUid([leftDealer, leftHealer, mainTanks[0]]);
  if (leftMembers.length > 0 && leftRepUid) {
    previews.push({ key: 'main_left', label: '본대 왼쪽', repUid: leftRepUid, names: leftMembers.map((c: any) => c.name) });
  }

  const rightMembers = [mainTanks[0], rightDealer, rightHealer].filter(Boolean);
  const hasRightBackline = !!rightDealer || !!rightHealer;
  const rightRepUid = pickRepresentativeUid([rightDealer, rightHealer, mainTanks[0]]);
  if (hasRightBackline && rightMembers.length > 0 && rightRepUid) {
    previews.push({ key: 'main_right', label: '본대 오른쪽', repUid: rightRepUid, names: rightMembers.map((c: any) => c.name) });
  }

  if (side.length > 0) previews.push({ key: 'side', label: '사이드', repUid: side[0].uid, names: side.map((c: any) => c.name) });
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

function collectAllFieldCards(state: any) {
  return [
    ...(state?.my_state?.field?.main || []),
    ...(state?.my_state?.field?.side || []),
    ...(state?.opponent_state?.field?.main || []),
    ...(state?.opponent_state?.field?.side || []),
  ];
}

const HP_ANIMATION_MS = 500;
const DESTROY_ANIMATION_MS = 500;
const DAMAGE_FLOAT_MS = 800;

function collectDamageMap(node: any, out: Record<string, number> = {}): Record<string, number> {
  if (!node || typeof node !== 'object') return out;

  const pushDelta = (uidValue: unknown, delta: number) => {
    if (!uidValue || !Number.isFinite(delta) || delta === 0) return;
    const uid = String(uidValue);
    const rounded = Math.round(delta);
    const prev = out[uid];
    if (prev === undefined || Math.abs(rounded) >= Math.abs(prev)) out[uid] = rounded;
  };

  const uid = node?.target || node?.target_uid || node?.uid || node?.source_uid;
  const damage = Number(node?.final_damage ?? node?.raw_damage ?? node?.damage ?? node?.amount);
  if (uid && Number.isFinite(damage) && damage > 0) pushDelta(uid, damage);

  const healed = Number(node?.healed ?? node?.heal ?? node?.final_heal ?? node?.amount_healed);
  if (uid && Number.isFinite(healed) && healed > 0) pushDelta(uid, -healed);

  Object.values(node).forEach((value) => {
    if (value && typeof value === 'object') collectDamageMap(value, out);
  });
  return out;
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
  const [duplicateTargetUid, setDuplicateTargetUid] = useState<string | null>(null);
  const [duplicateTargetRole, setDuplicateTargetRole] = useState<'tank' | 'dealer' | 'healer' | null>(null);
  const [duplicateTargetName, setDuplicateTargetName] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [localPendingPassive, setLocalPendingPassive] = useState<any | null>(null);
  const [localPendingSpellChoice, setLocalPendingSpellChoice] = useState<any | null>(null);
  const [columnChoice, setColumnChoice] = useState<ColumnChoice | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [renderGs, setRenderGs] = useState<GameState | null>(null);
  const [cardEffects, setCardEffects] = useState<Record<string, CardVisualEffect>>({});


  const wsRef = useRef<GameSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const manualCloseRef = useRef(false);
  const phaseStampRef = useRef('');
  const gsRef = useRef<GameState | null>(null);
  const pendingSpellNameRef = useRef<string | null>(null);
  const skipMyActionCueRef = useRef(false);
  const announcerDataRef = useRef(announcerData);
  const deferredGameStateRef = useRef<any | null>(null);
  const processGameStateRef = useRef<((msg: any) => void) | null>(null);
  const pendingDamageMapRef = useRef<Record<string, number>>({});
  const uiTimersRef = useRef<number[]>([]);
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
    nonBlocking?: boolean;
    onDone?: () => void;
  }) => {
    if (!props.skillName) return;
    const rawHeroKey = String(props.heroKey || '').toLowerCase();
    const inferredSpell = rawHeroKey.startsWith('spell_');
    if (!props.nonBlocking) {
      announcerDataRef.current = {
        type: 'skill',
        title: props.skillName,
        nonBlocking: false,
      } as any;
    }
    enqueueAnnouncer({
      type: 'skill',
      title: props.skillName,
      description: props.description || '',
      heroKey: props.heroKey || '',
      imageName: props.imageName,
      subtitle: props.subtitle,
      isSpell: props.isSpell ?? inferredSpell,
      duration: props.duration || 3200,
      nonBlocking: !!props.nonBlocking,
      onDone: props.onDone,
    });
  }, [enqueueAnnouncer]);

  const runAfterSkillAnnouncer = useCallback((payload: {
    skillName: string;
    heroKey?: string;
    imageName?: string;
    description?: string;
    subtitle?: string;
    isSpell?: boolean;
    sendAction: () => void;
  }) => {
    skipMyActionCueRef.current = true;
    showSkillUse({
      skillName: payload.skillName,
      heroKey: payload.heroKey,
      imageName: payload.imageName,
      description: payload.description,
      subtitle: payload.subtitle,
      isSpell: payload.isSpell,
      duration: 2200,
    });
    payload.sendAction();
  }, [showSkillUse]);

  useEffect(() => {
    announcerDataRef.current = announcerData;
    const isBlockingSkillAnnouncer = !!announcerData && announcerData.type === 'skill' && !announcerData.nonBlocking;
    if (!isBlockingSkillAnnouncer && deferredGameStateRef.current && processGameStateRef.current) {
      const deferred = deferredGameStateRef.current;
      deferredGameStateRef.current = null;
      processGameStateRef.current(deferred);
    }
  }, [announcerData]);

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
        duration: 5000,
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

  const showDeathPassiveNotice = useCallback((result: any) => {
    const gsNow = gsRef.current;
    if (!gsNow || !result) return;

    const allCards = collectAllFieldCards(gsNow);
    const seen = new Set<string>();
    const queue: any[] = [result];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      const isDeathPassive = !!(node?.death_prevented || node?.prevent_death || node?.transform || node?.summon || node?.enter_frozen || node?.reflect_by === 'reflect');
      if (isDeathPassive) {
        const key = `${node?.by || ''}:${node?.reflect_by || ''}:${node?.target || node?.uid || ''}:${node?.transform || ''}:${node?.enter_frozen ? 1 : 0}`;
        if (!seen.has(key)) {
          seen.add(key);
          const sourceUid = node?.target || node?.uid || node?.source_uid;
          const sourceCard = allCards.find((c: any) => c.uid === sourceUid);
          const sourceName = sourceCard?.name || '영웅';

          if (node?.by === 'mech_destruction' || node?.transform === 'hana_song' || node?.summon === 'hana_song') {
            showSkillUse({ skillName: '긴급 탈출', subtitle: `${sourceName} 패시브`, description: '메카 파괴 시 송하나 카드를 소환합니다.', heroKey: getHeroKey(sourceCard) || 'dva', imageName: sourceCard?.name || sourceName, isSpell: false, duration: 2600 });
          } else if (node?.by === 'frozen_revive' || node?.enter_frozen) {
            showSkillUse({ skillName: '급속 빙결', subtitle: `${sourceName} 패시브`, description: '치명 피해 시 빙결 상태가 되고 다음 턴 시작에 회복합니다.', heroKey: getHeroKey(sourceCard) || 'mei', imageName: sourceCard?.name || sourceName, isSpell: false, duration: 2600 });
          } else if (node?.by === 'immortality') {
            showSkillUse({ skillName: '불사장치', subtitle: `${sourceName} 발동`, description: '치명 피해를 무효화하고 체력을 1 남깁니다.', heroKey: 'spell_immortality_field', imageName: '불사장치', isSpell: true, duration: 2600 });
          } else if (node?.reflect_by === 'reflect') {
            showSkillUse({ skillName: '튕겨내기', subtitle: `${sourceName} 발동`, description: '치명 피해를 반사하여 공격자를 저지합니다.', heroKey: 'spell_deflect', imageName: '튕겨내기', isSpell: true, duration: 2600 });
          } else {
            showSystemNotice(sourceName, '사망 패시브 발동', 1200);
          }
        }
      }
      Object.values(node).forEach((value) => { if (value && typeof value === 'object') queue.push(value); });
    }
  }, [showSkillUse, showSystemNotice]);

  const showReactivePassiveFromStateDiff = useCallback((prevState: any, nextState: any) => {
    if (!prevState || !nextState) return;
    const detectKirikoSwiftStep = (ownerLabel: string, prevCards: any[], nextCards: any[]) => {
      const prevByUid = new Map(prevCards.map((c: any) => [c.uid, c]));
      for (const nextCard of nextCards) {
        const prevCard = prevByUid.get(nextCard.uid);
        if (!prevCard) continue;
        if (getHeroKey(nextCard) !== 'kiriko') continue;
        if (prevCard.zone !== 'side' || nextCard.zone !== 'main') continue;
        const threshold = Number(nextCard?.extra?.swift_step_threshold ?? 4);
        if (Number(nextCard?.current_hp ?? 0) > threshold) continue;
        showSkillUse({
          skillName: '순보',
          subtitle: `${ownerLabel} 패시브`,
          description: `체력이 ${threshold} 이하가 되어 본대로 이동합니다.`,
          heroKey: 'kiriko',
          imageName: nextCard?.name || '키리코',
          isSpell: false,
          duration: 2600,
        });
      }
    };

    const prevMy = [...(prevState?.my_state?.field?.main || []), ...(prevState?.my_state?.field?.side || [])];
    const prevOpp = [...(prevState?.opponent_state?.field?.main || []), ...(prevState?.opponent_state?.field?.side || [])];
    const nextMy = [...(nextState?.my_state?.field?.main || []), ...(nextState?.my_state?.field?.side || [])];
    const nextOpp = [...(nextState?.opponent_state?.field?.main || []), ...(nextState?.opponent_state?.field?.side || [])];
    detectKirikoSwiftStep('아군', prevMy, nextMy);
    detectKirikoSwiftStep('상대', prevOpp, nextOpp);
  }, [showSkillUse]);

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
          const processGameState = (gameStateMsg: any) => {
            const prevState = gsRef.current;
            if (pendingKillContextRef.current?.createdAt) {
              const pendingUids = pendingKillContextRef.current.fatalUids || [];
              if (pendingUids.length > 0) pushKillFeedByUids(pendingUids, gameStateMsg.state);
              pendingKillContextRef.current = null;
            }
            showReactivePassiveFromStateDiff(prevState, gameStateMsg.state);
            setGs(gameStateMsg.state);
            setRenderGs((prevRender) => {
              if (!prevRender) return gameStateMsg.state;
              const prevCards = collectAllFieldCards(prevRender);
              const nextCards = collectAllFieldCards(gameStateMsg.state);
              const nextUidSet = new Set(nextCards.map((c: any) => c.uid));
              const removedCards = prevCards.filter((c: any) => !nextUidSet.has(c.uid));
              const hasRemoved = removedCards.length > 0;
              if (!hasRemoved) return gameStateMsg.state;

              const ghostBySide = (sideKey: 'my_state' | 'opponent_state') => {
                const baseMain = [...(gameStateMsg.state as any)?.[sideKey]?.field?.main || []];
                const baseSide = [...(gameStateMsg.state as any)?.[sideKey]?.field?.side || []];
                const prevMain = [...(prevRender as any)?.[sideKey]?.field?.main || []];
                const prevSide = [...(prevRender as any)?.[sideKey]?.field?.side || []];
                const aliveMain = new Set(baseMain.map((c: any) => c.uid));
                const aliveSide = new Set(baseSide.map((c: any) => c.uid));
                const deadMain = prevMain.filter((c: any) => !aliveMain.has(c.uid)).map((c: any) => ({ ...c, current_hp: 0 }));
                const deadSide = prevSide.filter((c: any) => !aliveSide.has(c.uid)).map((c: any) => ({ ...c, current_hp: 0 }));
                return { main: [...baseMain, ...deadMain], side: [...baseSide, ...deadSide] };
              };

              const killDelay = window.setTimeout(() => setRenderGs(gameStateMsg.state), DESTROY_ANIMATION_MS + 50);
              uiTimersRef.current.push(killDelay);
              return {
                ...gameStateMsg.state,
                my_state: { ...gameStateMsg.state.my_state, field: ghostBySide('my_state') },
                opponent_state: { ...gameStateMsg.state.opponent_state, field: ghostBySide('opponent_state') },
              };
            });

            const damageMap = pendingDamageMapRef.current;
            const prevAll = collectAllFieldCards(prevState);
            const nextAll = collectAllFieldCards(gameStateMsg.state);
            const nextByUid = new Map(nextAll.map((c: any) => [c.uid, c]));
            const removedUidSet = new Set(prevAll.map((c: any) => c.uid).filter((uid) => !nextByUid.has(uid)));
            const effectPatch: Record<string, CardVisualEffect> = {};
            Object.entries(damageMap).forEach(([uid, damage]) => {
              effectPatch[uid] = {
                floatingDamage: damage,
                hpTransitionMs: HP_ANIMATION_MS,
                destroying: removedUidSet.has(uid),
              };
            });
            removedUidSet.forEach((uid) => {
              if (effectPatch[uid]) return;
              effectPatch[uid] = {
                hpTransitionMs: HP_ANIMATION_MS,
                destroying: true,
              };
            });
            if (Object.keys(effectPatch).length > 0) {
              setCardEffects((prev) => ({ ...prev, ...effectPatch }));
              const clearTimer = window.setTimeout(() => {
                setCardEffects((prev) => {
                  const next = { ...prev };
                  Object.keys(effectPatch).forEach((uid) => delete next[uid]);
                  return next;
                });
              }, Math.max(DAMAGE_FLOAT_MS, DESTROY_ANIMATION_MS) + 120);
              uiTimersRef.current.push(clearTimer);
            }
            pendingDamageMapRef.current = {};
            const serverPendingPassive = gameStateMsg?.state?.my_state?.pending_passive ?? gameStateMsg?.state?.my_state?.pendingPassive ?? null;
            const serverPendingSpellChoice = gameStateMsg?.state?.my_state?.pending_spell ?? gameStateMsg?.state?.my_state?.pendingSpell ?? null;
            if (serverPendingPassive) setLocalPendingPassive(null);
            if (serverPendingSpellChoice) setLocalPendingSpellChoice(null);
            if (!serverPendingPassive && !serverPendingSpellChoice && gameStateMsg?.state?.phase !== 'placement') {
              setLocalPendingPassive(null);
              setLocalPendingSpellChoice(null);
              setColumnChoice(null);
            }
          };
          processGameStateRef.current = processGameState;
          const activeAnnouncer = announcerDataRef.current;
          const isBlockingSkillAnnouncer = !!activeAnnouncer && activeAnnouncer.type === 'skill' && !activeAnnouncer.nonBlocking;
          if (isBlockingSkillAnnouncer) {
            deferredGameStateRef.current = msg;
            return;
          }
          processGameState(msg);
        }),
        ws.on('action_result', (msg: any) => {
          addLog(`내 행동: ${msg.action}`);
          const result = msg?.result || {};
          pendingDamageMapRef.current = collectDamageMap(result);
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
            if (result?.hero_key === 'spell_duplicate') {
              setDuplicateTargetUid(null);
              setDuplicateTargetRole(null);
              setDuplicateTargetName(null);
            }
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
            showSkillUse({
              skillName: result.passive_triggered.passive,
              subtitle: `${actorName} 패시브`,
              description: result?.passive_triggered?.message || '',
              heroKey: getHeroKey(myCasterCard) || String(result?.caster?.hero_key || msg?.hero_key || ''),
              imageName: myCasterCard?.name || actorName,
              isSpell: false,
              duration: 3000,
            });
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
          showDeathPassiveNotice(result);

          if (msg.action === 'use_skill' && resolvedSkillName) {
            if (skipMyActionCueRef.current) {
              skipMyActionCueRef.current = false;
            } else {
              const casterCard = myCasterCard;
              const usedSkillKey = String(result?.skill_key || msg?.skill_key || '');
              const isSwiftStrikeReset = !!(result?.swift_strike_reset && usedSkillKey === 'skill_1');
              if (isSwiftStrikeReset) {
                const casterName = result?.caster_name || casterCard?.name || actorName || '겐지';
                showSkillUse({
                  skillName: '질풍참 초기화',
                  description: '적 처치 시 질풍참이 즉시 초기화됩니다. 대상을 다시 선택하세요.',
                  heroKey: getHeroKey(casterCard) || String(result?.caster?.hero_key || msg?.hero_key || ''),
                  imageName: casterCard?.name || result?.caster_name || result?.caster?.name || actorName,
                  subtitle: `${casterName} 처치 성공`,
                  isSpell: false,
                  duration: 1000,
                  nonBlocking: true,
                });
              } else {
                showSkillUse({
                  skillName: resolvedSkillName,
                  description: getSkillDescriptionFromCard(casterCard, msg?.skill_key || result?.skill_key || result?.skill),
                  heroKey: getHeroKey(casterCard) || String(result?.caster?.hero_key || msg?.hero_key || ''),
                  imageName: casterCard?.name || result?.caster_name || result?.caster?.name || actorName,
                  subtitle: result?.caster_name || casterCard?.name || actorName,
                  isSpell: false,
                  duration: 3200,
                });
              }
              if (isSwiftStrikeReset) {
                const casterUid = result?.caster_uid || msg?.caster_uid || myCasterCard?.uid || null;
                const forcedSkillName = resolvedSkillName || '질풍참';
                setSelectedHandIdx(null);
                setColumnChoice(null);
                if (casterUid) setSelectedFieldUid(casterUid);
                setActionMode('skill_1');
                addLog(`${forcedSkillName} 초기화: 대상을 다시 선택하세요`);
                // showSystemNotice(forcedSkillName, '처치 성공! 추가 사용 대상을 선택하세요', 1500);
              }
            }
          }
          if (msg.action === 'execute_spell') {
            setLocalPendingSpellChoice(null);
            if (resolvedSkillName && !skipMyActionCueRef.current) {
              const spellCard = myHand.find((c: any) => c.hero_key === result?.hero_key) || result?.card;
              showSkillUse({ skillName: resolvedSkillName, description: getSkillDescriptionFromCard(spellCard), heroKey: result?.hero_key || spellCard?.hero_key || '', imageName: spellCard?.name || resolvedSkillName, isSpell: true, duration: 3200 });
            }
            if (skipMyActionCueRef.current) skipMyActionCueRef.current = false;
          }
          if (msg.action === 'execute_spell' && result?.rescued) showSystemNotice(result.rescued, 'TRASH → 패', 1400);
          if (msg.action === 'execute_spell' && result?.drawn_card) showSystemNotice(result.drawn_card, '덱 → 패', 1400);
        }),
        ws.on('opponent_action', (msg: any) => {
          addLog(`상대: ${msg.action}`);
          const result = msg?.result || {};
          pendingDamageMapRef.current = collectDamageMap(result);
          const oppState = gsRef.current?.opponent_state as any;
          const opponentCasterCard = findFieldCardByUid(oppState, msg?.caster_uid) || result?.caster || null;
          const opponentCasterHeroKey = getHeroKey(opponentCasterCard);
          const cue = buildOpponentSkillCue(msg, gsRef.current?.opponent_state, opponentCasterHeroKey);
          if (cue) showSkillUse({ skillName: cue.title, description: cue.description || '', heroKey: cue.heroKey || '', imageName: cue.imageName, subtitle: cue.subtitle, isSpell: !!cue.isSpell, duration: 3200 });
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
          if (result?.passive_triggered?.passive) {
            const passiveSource = findFieldCardByUid(gsRef.current?.opponent_state, result?.card_uid)
                || opponentCasterCard
                || result?.caster
                || result?.card
                || null;
            showSkillUse({
              skillName: result.passive_triggered.passive,
              subtitle: '상대 패시브',
              description: result?.passive_triggered?.message || '',
              heroKey: getHeroKey(passiveSource) || opponentCasterHeroKey || result?.card?.hero_key || result?.hero_key || '',
              imageName: passiveSource?.name || result?.caster_name || opponentCasterCard?.name || '상대',
              isSpell: false,
              duration: 3000,
            });
          }
          [ ...(result?.turn_start_logs || []), ...(result?.turn_end_logs || []) ].forEach((entry: any) => showPassiveNoticeFromLog(entry, 'opponent'));
          showDeathPassiveNotice(result);
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
      uiTimersRef.current.forEach((tid) => window.clearTimeout(tid));
      uiTimersRef.current = [];
      offFns.forEach((off) => { try { off(); } catch {} });
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (localWs) { try { localWs.disconnect(); } catch {} }
      wsRef.current = null;
    };
  }, [session, gameId, addLog, showPhaseChange, showSkillUse, showSystemNotice, showPassiveNoticeFromLog, showDeathPassiveNotice, pushKillFeedByUids, showReactivePassiveFromStateDiff]);

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

  const displayState = renderGs || gs;
  const my = displayState?.my_state || null;
  const opp = displayState?.opponent_state || null;
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
  const actionModeLabel = (actionMode && actionMode !== 'spell' && actionMode !== 'duplicate_place' && selectedMyFieldCard)
      ? getSkillNameFromCard(selectedMyFieldCard, actionMode)
      : null;
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

  const showContextPanel = (!!my && phase === 'mulligan' && !my.mulligan_done)
      || fieldSkills.length > 0
      || (!!actionMode && actionMode !== 'spell' && actionMode !== 'duplicate_place')
      || (actionMode === 'spell' && !!pendingSpell)
      || (actionMode === 'duplicate_place' && pendingSpell === 'spell_duplicate')
      || (phase === 'placement' && isMyTurn && !!selectedHandCard?.is_spell && !pendingSpell)
      || !!columnChoice
      || pendingPassive?.type === 'mercy_resurrect'
      || pendingPassive?.type === 'jetpack_cat_extra_place'
      || !!pendingSpellChoice;

  const handleHandClick = useCallback((card: HandCard, index: number) => {
    if (!my) return;
    if (phase === 'mulligan') {
      setSelectedMulligan((prev) => {
        if (prev[0] === index) {
          setDetailCard(card);
          return [];
        }
        return [index];
      });
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

  const isHazardWallTargeting =
      actionMode === 'skill_1'
      && !!selectedMyFieldCard
      && getHeroKey(selectedMyFieldCard) === 'hazard';

  const canSelectEmptySlot = useCallback((params: {
    zone: 'main' | 'side';
    role: 'tank' | 'dealer' | 'healer';
    slotIndex: 0 | 1;
    isOpponent: boolean;
  }) => {
    if (!isHazardWallTargeting) return false;
    if (!params.isOpponent) return false;
    const cards = params.zone === 'main' ? (opp?.field?.main || []) : (opp?.field?.side || []);
    return !cards.some((c: any) => c.role === params.role && Number(c?.extra?.slot_index ?? 0) === params.slotIndex);
  }, [isHazardWallTargeting, opp]);

  const handleEmptySlotSelect = useCallback((params: {
    zone: 'main' | 'side';
    role: 'tank' | 'dealer' | 'healer';
    slotIndex: 0 | 1;
    isOpponent: boolean;
  }) => {
    if (!selectedMyFieldCard || !isHazardWallTargeting) return;
    if (!params.isOpponent) {
      showSystemNotice('가시벽', '상대 필드의 빈 공간을 선택하세요', 1300);
      return;
    }
    const roleLabel = params.role === 'tank' ? '탱커' : params.role === 'dealer' ? '딜러' : '힐러';
    const skillName = getSkillNameFromCard(selectedMyFieldCard, 'skill_1');
    runAfterSkillAnnouncer({
      skillName,
      description: getSkillDescriptionFromCard(selectedMyFieldCard, 'skill_1'),
      heroKey: getHeroKey(selectedMyFieldCard),
      imageName: selectedMyFieldCard.name,
      subtitle: `${roleLabel} ${params.slotIndex + 1}번 칸`,
      isSpell: false,
      sendAction: () => send({
        action: 'use_skill',
        caster_uid: selectedMyFieldCard.uid,
        skill_key: 'skill_1',
        target_zone: params.zone,
        target_role: params.role,
        target_slot_index: params.slotIndex,
      }),
    });
    addLog(`${selectedMyFieldCard.name} — 가시벽 (${roleLabel} ${params.slotIndex + 1}번 칸)`);
    setSelectedFieldUid(null);
    setActionMode(null);
  }, [selectedMyFieldCard, isHazardWallTargeting, showSystemNotice, runAfterSkillAnnouncer, send, addLog]);

  const handleFieldClick = useCallback((card: FieldCard, isOpponent: boolean) => {
    if (columnChoice) { addLog('위 패널에서 열을 선택하세요'); return; }
    if (actionMode === 'spell' && pendingSpell) {
      if (pendingSpell === 'spell_duplicate') {
        if (!isOpponent) {
          addLog('복제 대상은 상대 필드 카드만 선택할 수 있습니다');
          showSystemNotice('복제', '상대 필드의 대상을 선택하세요', 1200);
          return;
        }
        setDuplicateTargetUid(card.uid);
        setDuplicateTargetRole(card.role);
        setDuplicateTargetName(card.name);
        setActionMode('duplicate_place');
        addLog(`복제 대상 선택: ${card.name} → 배치 위치 선택`);
        showSystemNotice('복제', `${card.name} 선택 · 빈 위치를 클릭하세요`, 1400);
        return;
      }
      const spellCard = my?.hand?.find((c: any) => c.hero_key === pendingSpell);
      runAfterSkillAnnouncer({
        skillName: pendingSpellName || spellCard?.name || '스킬 카드',
        description: getSkillDescriptionFromCard(spellCard, pendingSpellName || undefined),
        heroKey: pendingSpell || spellCard?.hero_key || '',
        imageName: spellCard?.name || pendingSpellName || '스킬 카드',
        subtitle: `${card.name} 대상`,
        isSpell: true,
        sendAction: () => send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: card.uid }),
      });
      addLog(`스킬 카드 → ${card.name}`);
      setActionMode(null); setPendingSpell(null); setPendingSpellName(null); setColumnChoice(null); setSelectedHandIdx(null); return;
    }
    if (actionMode && actionMode !== 'spell' && selectedFieldUid) {
      const caster = allMyField.find((c) => c.uid === selectedFieldUid);
      if (caster) {
        if (actionMode === 'skill_1' && getHeroKey(caster) === 'hazard') {
          showSystemNotice('가시벽', '상대 본대의 빈 공간을 클릭하세요', 1500);
          return;
        }
        if (actionMode === 'skill_1' && !isOpponent && getHeroKey(caster) === 'symmetra') {
          const blockedReason = getSymmetraTeleportBlockReason(caster, card, my?.field);
          if (blockedReason) {
            showSystemNotice('행동 불가', blockedReason, 1800);
            addLog(`오류: ${blockedReason}`);
            setActionMode(null);
            setSelectedFieldUid(null);
            return;
          }
        }
        const skillName = getSkillNameFromCard(caster, actionMode);
        runAfterSkillAnnouncer({
          skillName,
          description: getSkillDescriptionFromCard(caster, actionMode),
          heroKey: getHeroKey(caster),
          imageName: caster.name,
          subtitle: `${card.name} 대상`,
          isSpell: false,
          sendAction: () => send({ action: 'use_skill', caster_uid: caster.uid, skill_key: actionMode, target_uid: card.uid }),
        });
        addLog(`${caster.name} → ${card.name} (${skillName})`);
      }
      setSelectedFieldUid(null); setActionMode(null); return;
    }
    if (!isOpponent) {
      if (selectedFieldUid === card.uid) { setDetailCard(card); setSelectedFieldUid(null); }
      else { setSelectedFieldUid(card.uid); setSelectedHandIdx(null); setActionMode(null); setPendingSpell(null); setPendingSpellName(null); setColumnChoice(null); }
    } else setDetailCard(card);
  }, [columnChoice, actionMode, pendingSpell, pendingSpellName, selectedFieldUid, send, addLog, showSystemNotice, allMyField, my, runAfterSkillAnnouncer]);

  const handlePlace = useCallback((zone: 'main' | 'side', slotIndex?: 0 | 1) => {
    if (!my || !isMyTurn || phase !== 'placement') return;
    if (pendingSpell === 'spell_duplicate' && actionMode === 'duplicate_place' && duplicateTargetUid) {
      runAfterSkillAnnouncer({
        skillName: pendingSpellName || '복제',
        description: getSkillDescriptionFromCard({ hero_key: pendingSpell, skill_meta: {}, description: '' }, pendingSpellName || undefined),
        heroKey: pendingSpell,
        imageName: pendingSpellName || '복제',
        subtitle: `${duplicateTargetName || '대상'} 복제`,
        isSpell: true,
        sendAction: () => send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: duplicateTargetUid, zone, slot_index: zone === 'main' ? slotIndex : undefined }),
      });
      addLog(`복제 배치: ${duplicateTargetName || '대상 카드'} → ${zone === 'main' ? '본대' : '사이드'}`);
      setActionMode(null);
      setPendingSpell(null);
      setPendingSpellName(null);
      setDuplicateTargetUid(null);
      setDuplicateTargetRole(null);
      setDuplicateTargetName(null);
      setSelectedHandIdx(null);
      return;
    }
    if (selectedHandIdx === null) return;
    const card = my.hand[selectedHandIdx];
    const myFieldCount = (my.field.main?.length || 0) + (my.field.side?.length || 0);
    const zoneLabel = zone === 'main' ? '본대' : '사이드';
    if (card.is_spell && myFieldCount === 0) {
      addLog('필드에 카드가 없어 스킬 카드를 먼저 사용할 수 없음');
      showSystemNotice('최소 배치 필요', '필드에 카드를 1장 이상 먼저 배치하세요', 1700);
      return;
    }
    if (pendingPassive?.type === 'jetpack_cat_extra_place') {
      send({ action: 'resolve_passive_choice', hand_index: selectedHandIdx, zone, slot_index: zone === 'main' ? slotIndex : undefined });
      addLog(`${card.name} → ${zoneLabel} 추가 배치`);
      setSelectedHandIdx(null);
      return;
    }
    send({ action: 'place_card', hand_index: selectedHandIdx, zone, slot_index: zone === 'main' ? slotIndex : undefined });
    addLog(`${card.name} → ${zoneLabel} ${card.is_spell ? '사용' : '배치'}`);
    setSelectedHandIdx(null);
  }, [my, selectedHandIdx, isMyTurn, phase, pendingPassive, send, addLog, showSystemNotice, pendingSpell, actionMode, duplicateTargetUid, duplicateTargetName, pendingSpellName, runAfterSkillAnnouncer]);

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
      runAfterSkillAnnouncer({
        skillName: rawSkillName,
        description: getSkillDescriptionFromCard(caster, skillKey),
        heroKey: getHeroKey(caster),
        imageName: caster.name,
        subtitle: `${caster.name} 사용`,
        isSpell: false,
        sendAction: () => send({ action: 'use_skill', caster_uid: caster.uid, skill_key: skillKey }),
      });
      addLog(`${caster.name} — ${rawSkillName} 즉시 사용`);
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
    if (getHeroKey(caster) === 'hazard' && skillKey === 'skill_1') {
      setColumnChoice(null);
      setActionMode(skillKey);
      addLog(`${caster.name} — ${rawSkillName} 준비`);
      showSystemNotice(rawSkillName, '상대 본대의 빈 공간을 클릭하세요', 1400);
      return;
    }
    setColumnChoice(null); setActionMode(skillKey); addLog(`${caster.name} — ${rawSkillName} 준비`); showSystemNotice(rawSkillName, `${caster.name} 준비`, 900);
  }, [selectedMyFieldCard, send, addLog, showSystemNotice, runAfterSkillAnnouncer]);

  const runMulligan = useCallback(() => {
    if (selectedMulligan.length === 0) return;
    send({ action: 'mulligan', card_indices: selectedMulligan.slice(0, 1) });
    setSelectedMulligan([]);
  }, [send, selectedMulligan]);
  const skipMulligan = useCallback(() => { send({ action: 'skip_mulligan' }); setSelectedMulligan([]); }, [send]);
  const selectColumn = useCallback((repUid: string, label: string) => {
    if (columnChoice?.source === 'spell' && pendingSpell) {
      const spellCard = my?.hand?.find((c: any) => c.hero_key === pendingSpell);
      runAfterSkillAnnouncer({
        skillName: columnChoice.skillName,
        description: getSkillDescriptionFromCard(spellCard, columnChoice.skillName),
        heroKey: pendingSpell || spellCard?.hero_key || '',
        imageName: spellCard?.name || columnChoice.skillName,
        subtitle: `${label} 대상`,
        isSpell: true,
        sendAction: () => send({ action: 'execute_spell', hero_key: pendingSpell, target_uid: repUid }),
      });
      addLog(`${columnChoice.skillName} → ${label}`);
    } else if (columnChoice?.source === 'skill' && selectedMyFieldCard && columnChoice.skillKey) {
      runAfterSkillAnnouncer({
        skillName: columnChoice.skillName,
        description: getSkillDescriptionFromCard(selectedMyFieldCard, columnChoice.skillKey),
        heroKey: getHeroKey(selectedMyFieldCard),
        imageName: selectedMyFieldCard.name,
        subtitle: `${label} 대상`,
        isSpell: false,
        sendAction: () => send({ action: 'use_skill', caster_uid: selectedMyFieldCard.uid, skill_key: columnChoice.skillKey, target_uid: repUid }),
      });
      addLog(`${selectedMyFieldCard.name} → ${label} (${columnChoice.skillName})`);
    }
    setColumnChoice(null); setActionMode(null); setPendingSpell(null); setPendingSpellName(null); setSelectedHandIdx(null);
  }, [columnChoice, pendingSpell, selectedMyFieldCard, send, addLog, my, runAfterSkillAnnouncer]);
  const cancelColumnChoice = useCallback(() => { setColumnChoice(null); setPendingSpell(null); setPendingSpellName(null); }, []);
  const cancelPendingSpell = useCallback(() => {
    setActionMode(null);
    setPendingSpell(null);
    setPendingSpellName(null);
    setDuplicateTargetUid(null);
    setDuplicateTargetRole(null);
    setDuplicateTargetName(null);
  }, []);
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
    cardEffects,
    selectedHandIdx, selectedMulligan, selectedFieldUid, selectedHandCard, selectedMyFieldCard, detailCard,
    actionMode, pendingSpell, pendingSpellName, pendingPassive, pendingSpellChoice, columnChoice, enemyColumns,
    selectedHeroKey, selectedChargeLevel, actionModeLabel, canActUids, fieldSkills, showContextPanel, killFeed, dismissKillFeedItem,
    handleHandClick, handleFieldClick, handlePlace, prepareSkill, runMulligan, skipMulligan,
    selectColumn, cancelColumnChoice, cancelPendingSpell, useSelectedSpell, cancelSelectedHand,
    resolveMercy, skipMercy, skipJetpackCat, resolveSpellChoice, handleEndMainButton, leaveGame, surrenderGame,
    setDetailCard, setSelectedFieldUid, setActionMode, setColumnChoice, setPendingSpell, setPendingSpellName,
    duplicateTargetUid, duplicateTargetRole, duplicateTargetName,
    canSelectEmptySlot, handleEmptySlotSelect,
  };
}

export default useOnlineGameController;
