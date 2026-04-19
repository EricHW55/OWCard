import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbySocket, buildWsUrl, getApiBase } from '../api/ws';
import {
    buildCoreImagePreloadList,
    getCardArtCandidates,
    getCardBackImageSrc,
    getCardImageSrc,
    getIllustrationCandidates,
    preloadImageAssets,
} from '../utils/heroImage';
import './LobbyPage.css';

interface RoomInfo {
    room_id: string;
    room_code: string;
    host: { id: number; username: string };
    guest: { id: number; username: string } | null;
    status: 'waiting' | 'ready' | 'in_game' | 'finished';
    spectator_count: number;
    game_id: string | null;
    host_deck_set?: boolean;
    guest_deck_set?: boolean;
    match_format?: MatchFormat;
}

interface SessionInfo {
    token: string;
    player_id: number;
    username: string;
    nickname: string;
    is_admin: boolean;
}

interface DeckInfo {
    id: number;
    player_id: number;
    name: string;
    cards: Array<{ card_template_id: number; quantity: number }>;
}

interface CardTemplateLite {
    id: number;
    hero_key?: string;
    name?: string;
    role?: string;
    is_spell?: boolean;
}

type MenuKey = 'play' | 'deck' | 'rules' | 'status-effects' | 'admin';
type PlayMode = 'none' | 'quick' | 'private';
type MatchFormat = 'bo1' | 'bo3';
type PlayEntryType = 'quick' | 'competitive' | 'private';
type BackgroundMotionAxis = 'none' | 'horizontal' | 'vertical';

function getSession(): SessionInfo | null {
    const token = sessionStorage.getItem('access_token');
    const playerIdRaw = sessionStorage.getItem('player_id');
    const username = sessionStorage.getItem('username');
    const nickname = sessionStorage.getItem('nickname');

    if (!token || !playerIdRaw || !username || !nickname) return null;

    return {
        token,
        player_id: Number(playerIdRaw),
        username,
        nickname,
        is_admin: sessionStorage.getItem('is_admin') === 'true',
    };
}

const horizontalWallpapers = [
    '/wallpaper/Horizontal/1.jpg',
    '/wallpaper/Horizontal/2.webp',
    '/wallpaper/Horizontal/3.webp',
    '/wallpaper/Horizontal/4.webp',
    '/wallpaper/Horizontal/5.webp',
    '/wallpaper/Horizontal/6.webp',
    '/wallpaper/Horizontal/7.webp',
    '/wallpaper/Horizontal/8.jpg',
    '/wallpaper/Horizontal/9.jpg',
    '/wallpaper/Horizontal/10.jpg',
    '/wallpaper/Horizontal/11.webp',
];

const verticalWallpapers = [
    '/wallpaper/Vertical/1.png',
    '/wallpaper/Vertical/2.jpg',
    '/wallpaper/Vertical/3.jpg',
    '/wallpaper/Vertical/4.jpg',
    '/wallpaper/Vertical/5.jpg',
    '/wallpaper/Vertical/6.png',
    '/wallpaper/Vertical/7.jpg',
    '/wallpaper/Vertical/8.webp',
    '/wallpaper/Vertical/9.webp',
    '/wallpaper/Vertical/10.jpg',
];

const LobbyPage: React.FC = () => {
    const navigate = useNavigate();
    const wsRef = useRef<LobbySocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    const closingRef = useRef(false);
    const navigatingToGameRef = useRef(false);
    const queueSyncTimerRef = useRef<number | null>(null);

    const [session, setSession] = useState<SessionInfo | null>(() => getSession());
    const [nicknameInput, setNicknameInput] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    const [connected, setConnected] = useState(false);
    const [room, setRoom] = useState<RoomInfo | null>(null);
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [roomCode, setRoomCode] = useState('');
    const [privateRoomLimitMessage, setPrivateRoomLimitMessage] = useState('');
    const [deckId, setDeckId] = useState<number>(1);
    const [decks, setDecks] = useState<DeckInfo[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [queueing, setQueueing] = useState(false);
    const [queueFormat, setQueueFormat] = useState<MatchFormat>('bo1');
    const [queueStartedAt, setQueueStartedAt] = useState<number | null>(null);
    const [queueNow, setQueueNow] = useState(() => Date.now());
    const [viewportSize, setViewportSize] = useState(() => ({
        width: typeof window !== 'undefined' ? window.innerWidth : 0,
        height: typeof window !== 'undefined' ? window.innerHeight : 0,
    }));
    const [isPortrait, setIsPortrait] = useState(() =>
        typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : false,
    );
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
    const [backgroundMotionAxis, setBackgroundMotionAxis] = useState<BackgroundMotionAxis>('none');
    const [backgroundPanRange, setBackgroundPanRange] = useState(0);
    const [backgroundPanDuration, setBackgroundPanDuration] = useState(26);
    const [activeMenu, setActiveMenu] = useState<MenuKey | null>(null);
    const [playMode, setPlayMode] = useState<PlayMode>('none');
    const [showPlayModal, setShowPlayModal] = useState(false);
    const [showQuickDeckModal, setShowQuickDeckModal] = useState(false);
    const [quickMatchDeckId, setQuickMatchDeckId] = useState<number>(1);
    const [quickMatchFormat, setQuickMatchFormat] = useState<MatchFormat>('bo1');
    const [privateRoomFormat, setPrivateRoomFormat] = useState<MatchFormat>('bo1');
    const [pendingJoinRoom, setPendingJoinRoom] = useState<RoomInfo | null>(null);
    const pendingSpectateRef = useRef<{ roomCode: string; gameId: string } | null>(null);
    const backgroundNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
    const preloadPromiseRef = useRef<Promise<void> | null>(null);
    const cardTemplateByIdRef = useRef<Map<number, CardTemplateLite>>(new Map());

    const addLog = useCallback((msg: string) => {
        setLogs((prev) => [...prev.slice(-29), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    }, []);

    const send = useCallback((data: Record<string, unknown>) => {
        wsRef.current?.send(data);
    }, []);

    const clearQueueSyncTimer = useCallback(() => {
        if (queueSyncTimerRef.current) {
            window.clearTimeout(queueSyncTimerRef.current);
            queueSyncTimerRef.current = null;
        }
    }, []);

    const ensureGameImageWarmup = useCallback(() => {
        if (!preloadPromiseRef.current) {
            preloadPromiseRef.current = preloadImageAssets([
                ...buildCoreImagePreloadList(),
                getCardBackImageSrc(),
                '/illustration/card_back.png',
            ], 2200);
        }
        return preloadPromiseRef.current;
    }, []);

    const safeNavigateToGame = useCallback((gameId?: string) => {
        if (!gameId || navigatingToGameRef.current) return;
        navigatingToGameRef.current = true;
        setQueueing(false);
        setQueueStartedAt(null);
        void ensureGameImageWarmup().then(() => {
            navigate(`/game/${gameId}`);
        });
    }, [ensureGameImageWarmup, navigate]);

    const safeNavigateToSpectate = useCallback((gameId?: string, roomCode?: string) => {
        if (!gameId || navigatingToGameRef.current) return;
        navigatingToGameRef.current = true;
        void ensureGameImageWarmup().then(() => {
            const query = new URLSearchParams({ spectate: '1' });
            if (roomCode) query.set('roomCode', roomCode);
            navigate(`/game/${gameId}?${query.toString()}`);
        });
    }, [ensureGameImageWarmup, navigate]);

    const syncMatchStatus = useCallback(async (targetSession?: SessionInfo | null) => {
        const activeSession = targetSession ?? session;
        if (!activeSession) return;
        try {
            const res = await fetch(`${getApiBase()}/lobby/match-status?player_id=${activeSession.player_id}`);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const data = await res.json();
            if (data?.state === 'matched') {
                addLog('매칭 상태 복구: 이미 매칭된 게임으로 이동합니다.');
                safeNavigateToGame(data.game_id);
                return;
            }
            if (data?.state === 'queued') {
                setQueueing(true);
                setQueueFormat(data?.match_format === 'bo3' ? 'bo3' : 'bo1');
                setQueueStartedAt((prev) => prev ?? Date.now());
                setQueueNow(Date.now());
                addLog('매칭 상태 복구: 대기열 상태를 복원했습니다.');
                return;
            }
            setQueueing(false);
            setQueueFormat('bo1');
            setQueueStartedAt(null);
        } catch (e: any) {
            addLog(`매칭 상태 조회 실패: ${e?.message ?? 'unknown error'}`);
        }
    }, [session, addLog, safeNavigateToGame]);

    const preloadDeckImages = useCallback((targetDeckId?: number | null) => {
        if (!targetDeckId) return;
        const selectedDeck = decks.find((deck) => deck.id === targetDeckId);
        if (!selectedDeck) return;
        const templateById = cardTemplateByIdRef.current;
        const deckSources = selectedDeck.cards.flatMap((entry) => {
            const template = templateById.get(Number(entry.card_template_id));
            if (!template) return [];
            return [
                getCardImageSrc(template),
                ...getIllustrationCandidates(template),
                ...getCardArtCandidates(template),
            ];
        });
        if (!deckSources.length) return;
        void preloadImageAssets([
            getCardBackImageSrc(),
            '/illustration/card_back.png',
            ...deckSources,
        ], 3500);
    }, [decks]);

    useEffect(() => {
        // 로비 진입 시점에 선행 로드해서 게임 진입 시 코인 토스 첫 프레임 깨짐을 줄인다.
        void ensureGameImageWarmup();
    }, [ensureGameImageWarmup]);

    const applyDeckToRoom = useCallback((roomId: string, selectedDeckId?: number) => {
        const chosenDeckId = selectedDeckId ?? deckId;
        send({ action: 'set_deck', room_id: roomId, deck_id: chosenDeckId });
        addLog(`덱 자동 적용 요청: ${chosenDeckId}`);
    }, [send, deckId, addLog]);

    const refreshRooms = useCallback(async () => {
        try {
            const res = await fetch(`${getApiBase()}/rooms`);
            const data = await res.json();
            setRooms(Array.isArray(data) ? data : []);
        } catch {
            addLog('방 목록을 불러오지 못했습니다.');
        }
    }, [addLog]);

    const refreshDecks = useCallback(async (playerId: number, preferredDeckId?: number | null) => {
        try {
            const res = await fetch(`${getApiBase()}/decks/player/${playerId}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setDecks(list);

            if (list.length === 0) {
                setDeckId(1);
                return;
            }

            if (preferredDeckId && list.some((d: DeckInfo) => d.id === preferredDeckId)) {
                setDeckId(preferredDeckId);
                return;
            }

            if (!list.some((d: DeckInfo) => d.id === deckId)) {
                setDeckId(list[0].id);
            }
        } catch {
            addLog('덱 목록을 불러오지 못했습니다.');
        }
    }, [addLog, deckId]);

    useEffect(() => {
        refreshRooms();
        const id = window.setInterval(refreshRooms, 3000);
        return () => window.clearInterval(id);
    }, [refreshRooms]);

    useEffect(() => {
        if (!session) return;
        refreshDecks(session.player_id);
    }, [session, refreshDecks]);

    useEffect(() => {
        if (!session) return;
        ensureGameImageWarmup();
    }, [session, ensureGameImageWarmup]);

    useEffect(() => {
        if (!session) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${getApiBase()}/cards/`);
                if (!res.ok) return;
                const list = await res.json();
                if (cancelled || !Array.isArray(list)) return;
                cardTemplateByIdRef.current = new Map(
                    list.map((item: CardTemplateLite) => [Number(item.id), item]),
                );
                preloadDeckImages(deckId);
                preloadDeckImages(quickMatchDeckId);
            } catch {
                // ignore warmup errors
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [session, deckId, quickMatchDeckId, preloadDeckImages]);

    useEffect(() => {
        preloadDeckImages(deckId);
    }, [deckId, preloadDeckImages]);

    useEffect(() => {
        preloadDeckImages(quickMatchDeckId);
    }, [quickMatchDeckId, preloadDeckImages]);

    useEffect(() => {
        if (!decks.length) {
            setQuickMatchDeckId(1);
            return;
        }
        if (!decks.some((deck) => deck.id === quickMatchDeckId)) {
            setQuickMatchDeckId(decks[0].id);
        }
    }, [decks, quickMatchDeckId]);

    useEffect(() => {
        if (!queueing || !queueStartedAt) return;
        const id = window.setInterval(() => {
            setQueueNow(Date.now());
        }, 1000);
        return () => window.clearInterval(id);
    }, [queueing, queueStartedAt]);

    useEffect(() => {
        const updateOrientation = () => {
            setIsPortrait(window.innerHeight > window.innerWidth);
            setViewportSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        updateOrientation();
        window.addEventListener('resize', updateOrientation);
        window.addEventListener('orientationchange', updateOrientation);

        return () => {
            window.removeEventListener('resize', updateOrientation);
            window.removeEventListener('orientationchange', updateOrientation);
        };
    }, []);

    useEffect(() => {
        const candidates = isPortrait ? verticalWallpapers : horizontalWallpapers;
        if (candidates.length === 0) {
            setBackgroundImage(null);
            return;
        }
        const randomIndex = Math.floor(Math.random() * candidates.length);
        setBackgroundImage(candidates[randomIndex]);
    }, [isPortrait]);

    const updateBackgroundMotion = useCallback((imageWidth: number, imageHeight: number) => {
        if (imageWidth <= 0 || imageHeight <= 0) {
            setBackgroundMotionAxis('none');
            setBackgroundPanRange(0);
            setBackgroundPanDuration(26);
            return;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const imageAspect = imageWidth / imageHeight;
        const viewportAspect = viewportWidth / viewportHeight;

        if (imageAspect > viewportAspect) {
            const renderedWidth = viewportHeight * imageAspect;
            const overflowX = Math.max(0, renderedWidth - viewportWidth);
            const panRange = Math.max(0, Math.floor(overflowX / 2));
            setBackgroundMotionAxis(panRange > 0 ? 'horizontal' : 'none');
            setBackgroundPanRange(panRange);
            setBackgroundPanDuration(Math.min(44, Math.max(20, 18 + panRange / 22)));
            return;
        }

        if (imageAspect < viewportAspect) {
            const renderedHeight = viewportWidth / imageAspect;
            const overflowY = Math.max(0, renderedHeight - viewportHeight);
            const panRange = Math.max(0, Math.floor(overflowY / 2));
            setBackgroundMotionAxis(panRange > 0 ? 'vertical' : 'none');
            setBackgroundPanRange(panRange);
            setBackgroundPanDuration(Math.min(44, Math.max(20, 18 + panRange / 22)));
            return;
        }

        setBackgroundMotionAxis('none');
        setBackgroundPanRange(0);
        setBackgroundPanDuration(26);
    }, []);

    useEffect(() => {
        if (!backgroundImage) {
            backgroundNaturalSizeRef.current = null;
            setBackgroundMotionAxis('none');
            setBackgroundPanRange(0);
            setBackgroundPanDuration(26);
        }
    }, [backgroundImage]);

    useEffect(() => {
        const handleResize = () => {
            const naturalSize = backgroundNaturalSizeRef.current;
            if (!naturalSize) return;
            updateBackgroundMotion(naturalSize.width, naturalSize.height);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, [updateBackgroundMotion]);

    useEffect(() => {
        if (!session) return;
        closingRef.current = false;
        reconnectAttemptRef.current = 0;
        navigatingToGameRef.current = false;

        const clearReconnectTimer = () => {
            if (reconnectTimerRef.current) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };

        const url = buildWsUrl('/ws/lobby', {
            token: session.token,
            player_id: session.player_id,
            username: session.username,
        });

        const setupSocket = () => {
            const ws = new LobbySocket();
            wsRef.current = ws;
            ws.connect(url);

            ws.on('_connected', () => {
                setConnected(true);
                reconnectAttemptRef.current = 0;
                clearReconnectTimer();
                addLog('로비 서버 연결됨');
                void syncMatchStatus(session);
            });

            ws.on('_disconnected', () => {
                setConnected(false);
                addLog('로비 서버 연결 종료');
                if (closingRef.current) return;
                const attempt = reconnectAttemptRef.current + 1;
                reconnectAttemptRef.current = attempt;
                const delay = Math.min(5000, 500 * (2 ** (attempt - 1)));
                addLog(`로비 재연결 시도 예약 (${Math.round(delay)}ms)`);
                clearReconnectTimer();
                reconnectTimerRef.current = window.setTimeout(() => {
                    setupSocket();
                }, delay);
            });

            ws.on('room_created', (msg: any) => {
                setPrivateRoomLimitMessage('');
                setRoom(msg.room);
                addLog(`방 생성 완료 (${msg.room.room_code})`);
                applyDeckToRoom(msg.room.room_id);
                setPrivateRoomFormat(msg?.room?.match_format === 'bo3' ? 'bo3' : 'bo1');
                setPlayMode('private');
                setShowPlayModal(false);
                refreshRooms();
            });

            ws.on('room_joined', (msg: any) => {
                setRoom(msg.room);
                addLog(`방 참가 완료 (${msg.room.room_code})`);
                applyDeckToRoom(msg.room.room_id);
                setPrivateRoomFormat(msg?.room?.match_format === 'bo3' ? 'bo3' : 'bo1');
                setPlayMode('private');
                setShowPlayModal(false);
                refreshRooms();
            });

            ws.on('guest_joined', (msg: any) => {
                setRoom(msg.room);
                addLog(`상대가 입장했습니다: ${msg.room.guest?.username ?? 'Guest'}`);
                refreshRooms();
            });

            ws.on('room_updated', (msg: any) => {
                setRoom(msg.room);
                refreshRooms();
            });

            ws.on('room_closed', (msg: any) => {
                const closedCode = String(msg?.room_code ?? '');
                setRoom((prev) => (prev?.room_code === closedCode ? null : prev));
                setPendingJoinRoom((prev) => (prev?.room_code === closedCode ? null : prev));
                if (pendingSpectateRef.current?.roomCode === closedCode) {
                    pendingSpectateRef.current = null;
                }
                addLog(`방 종료: ${closedCode || '알 수 없음'}`);
                refreshRooms();
            });

            ws.on('match_found', (msg: any) => {
                clearQueueSyncTimer();
                setQueueFormat(msg?.match_format === 'bo3' ? 'bo3' : 'bo1');
                addLog(`퀵매칭 완료! 상대: ${msg.opponent?.username ?? '상대'}`);
                safeNavigateToGame(msg.game_id);
            });

            ws.on('game_starting', (msg: any) => {
                clearQueueSyncTimer();
                addLog(`게임 시작: ${msg.game_id}`);
                safeNavigateToGame(msg.game_id);
            });

            ws.on('game_starting_spectate', (msg: any) => {
                addLog(`관전 시작: ${msg.game_id}`);
                safeNavigateToSpectate(msg.game_id, msg?.room?.room_code);
            });

            ws.on('spectating', (msg: any) => {
                const gameId = msg?.room?.game_id || pendingSpectateRef.current?.gameId;
                const roomCode = msg?.room?.room_code || pendingSpectateRef.current?.roomCode;
                pendingSpectateRef.current = null;
                if (!gameId) {
                    addLog('관전 시작 실패: 게임 정보를 찾을 수 없습니다.');
                    refreshRooms();
                    return;
                }
                addLog(`관전 입장: ${roomCode ?? ''}`);
                safeNavigateToSpectate(gameId, roomCode);
            });

            ws.on('queue_joined', (msg: any) => {
                clearQueueSyncTimer();
                setQueueing(true);
                setQueueFormat(msg?.match_format === 'bo3' ? 'bo3' : quickMatchFormat);
                setQueueStartedAt((prev) => prev ?? Date.now());
                setQueueNow(Date.now());
                addLog(`매칭 대기열 참가. 현재 큐 인원: ${msg.queue_size}`);
            });

            ws.on('queue_left', () => {
                clearQueueSyncTimer();
                setQueueing(false);
                setQueueFormat('bo1');
                setQueueStartedAt(null);
                addLog('매칭 대기열에서 나왔습니다.');
            });

            ws.on('error', (msg: any) => {
                if (pendingSpectateRef.current) {
                    pendingSpectateRef.current = null;
                    refreshRooms();
                }
                if (typeof msg?.message === 'string' && msg.message.includes('이미 생성한 사설방')) {
                    setPrivateRoomLimitMessage(msg.message);
                }
                addLog(`오류: ${msg.message}`);
            });
        };

        void syncMatchStatus(session);
        setupSocket();

        return () => {
            closingRef.current = true;
            clearReconnectTimer();
            clearQueueSyncTimer();
            wsRef.current?.disconnect();
            wsRef.current = null;
        };
    }, [session, addLog, refreshRooms, applyDeckToRoom, safeNavigateToGame, safeNavigateToSpectate, syncMatchStatus, clearQueueSyncTimer, quickMatchFormat]);

    const createGuestSession = async () => {
        const nickname = nicknameInput.trim();
        if (nickname.length < 2) {
            addLog('닉네임은 2글자 이상으로 해야합니다.');
            return;
        }

        try {
            setAuthLoading(true);
            const res = await fetch(`${getApiBase()}/auth/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || '게스트 입장 실패');
            }

            const data = await res.json();
            const nextSession: SessionInfo = {
                token: data.access_token,
                player_id: data.player_id,
                username: data.nickname,
                nickname: data.nickname,
                is_admin: Boolean(data.is_admin),
            };

            sessionStorage.setItem('access_token', nextSession.token);
            sessionStorage.setItem('player_id', String(nextSession.player_id));
            sessionStorage.setItem('username', nextSession.username);
            sessionStorage.setItem('nickname', nextSession.nickname);
            sessionStorage.setItem('is_admin', String(nextSession.is_admin));

            setSession(nextSession);
            setDeckId(data.default_deck_id ?? 1);
            await refreshDecks(nextSession.player_id, data.default_deck_id ?? null);
            addLog(`게스트 입장 완료: ${nextSession.nickname}`);
        } catch (e: any) {
            addLog(`게스트 입장 실패: ${e.message}`);
        } finally {
            setAuthLoading(false);
        }
    };

    const openMenu = (key: MenuKey) => {
        setActiveMenu(key);
        if (key === 'play') {
            setShowPlayModal(true);
            return;
        }
        if (key === 'deck') {
            navigate('/deck-builder');
        }
        if (key === 'rules') {
            navigate('/rules');
            return;
        }
        if (key === 'status-effects') {
            navigate('/status-effects');
            return;
        }
        if (key === 'admin' && session?.is_admin) {
            navigate('/admin');
        }
    };

    const startQuickMatch = (format: MatchFormat) => {
        setPlayMode('quick');
        setActiveMenu('play');
        setQuickMatchFormat(format);
        if (queueing) {
            if (!connected) {
                addLog('로비 연결이 끊겨 퀵매칭 취소 요청을 보낼 수 없습니다.');
                return;
            }
            send({ action: 'leave_queue' });
            setShowPlayModal(false);
            return;
        }
        setShowQuickDeckModal(true);
    };

    const confirmQuickMatch = () => {
        if (!connected) {
            addLog('로비 연결이 끊겨 퀵매칭을 시작할 수 없습니다. 재연결을 기다려주세요.');
            return;
        }
        clearQueueSyncTimer();
        setQueueing(true);
        setQueueFormat(quickMatchFormat);
        setQueueStartedAt(Date.now());
        setQueueNow(Date.now());
        send({ action: 'join_queue', deck_id: quickMatchDeckId, match_format: quickMatchFormat });
        addLog(`퀵매칭 시작(${quickMatchFormat.toUpperCase()}): 덱 ${quickMatchDeckId}`);
        queueSyncTimerRef.current = window.setTimeout(() => {
            addLog('퀵매칭 ACK 지연으로 상태 재동기화를 수행합니다.');
            void syncMatchStatus();
        }, 3000);
        setShowQuickDeckModal(false);
        setShowPlayModal(false);
    };

    const openPrivateLobby = () => {
        setActiveMenu('play');
        setPlayMode('private');
        setShowPlayModal(false);
    };

    const handlePlayEntrySelect = (entryType: PlayEntryType) => {
        if (entryType === 'quick') {
            startQuickMatch('bo1');
            return;
        }
        if (entryType === 'competitive') {
            startQuickMatch('bo3');
            return;
        }
        openPrivateLobby();
    };

    const handleCreateRoom = () => {
        if (!decks.length) {
            addLog('덱이 없어 방을 만들 수 없습니다. 덱 빌더에서 덱을 먼저 만들어주세요.');
            return;
        }
        setPrivateRoomLimitMessage('');
        send({ action: 'create_room', match_format: privateRoomFormat });
    };

    const handleJoinRoom = (code?: string) => {
        const joiningCode = (code ?? roomCode).trim().toUpperCase();
        if (!joiningCode) {
            addLog('방 코드를 입력해주세요.');
            return;
        }
        setRoomCode(joiningCode);
        send({ action: 'join_room', room_code: joiningCode });
    };

    const handleSpectateRoom = (targetRoom: RoomInfo) => {
        if (!targetRoom.game_id) {
            addLog('아직 게임이 시작되지 않아 관전할 수 없습니다.');
            return;
        }
        pendingSpectateRef.current = { roomCode: targetRoom.room_code, gameId: targetRoom.game_id };
        send({ action: 'spectate', room_code: targetRoom.room_code });
    };

    const handleBackToLobby = () => {
        setActiveMenu(null);
        setPlayMode('none');
        setShowPlayModal(false);
        setPendingJoinRoom(null);
        setRoomCode('');
    };

    const isHost = room?.host.id === session?.player_id;
    const useCompactMenuLayout = isPortrait || viewportSize.width <= 1280;
    const showMainMenu = !(activeMenu === 'play' && playMode === 'private');
    // const menuClassName = `lobby-menu ${isPortrait && showMainMenu ? 'main-menu-mode' : ''}`.trim();
    const menuClassName = `lobby-menu ${useCompactMenuLayout && showMainMenu ? 'main-menu-mode' : ''} ${useCompactMenuLayout && activeMenu === 'play' && playMode === 'private' ? 'private-mode' : ''}`.trim();
    const queueElapsedSec = queueStartedAt ? Math.max(0, Math.floor((queueNow - queueStartedAt) / 1000)) : 0;
    const queueElapsedMin = String(Math.floor(queueElapsedSec / 60)).padStart(2, '0');
    const queueElapsedRemainSec = String(queueElapsedSec % 60).padStart(2, '0');
    const bgMotionStyle = {
        '--lobby-bg-pan-range': `${backgroundPanRange}px`,
        '--lobby-bg-pan-duration': `${backgroundPanDuration}s`,
    } as React.CSSProperties;
    const bgClassName = `lobby-background ${backgroundMotionAxis}`;

    const handleBackgroundImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        backgroundNaturalSizeRef.current = { width: naturalWidth, height: naturalHeight };
        updateBackgroundMotion(naturalWidth, naturalHeight);
    };

    if (!session) {
        return (
            <div className="lobby-auth-page">
                <div className={bgClassName} style={bgMotionStyle}>
                    {backgroundImage && (
                        <img
                            src={backgroundImage}
                            alt=""
                            aria-hidden="true"
                            className="lobby-background-image"
                            onLoad={handleBackgroundImageLoad}
                        />
                    )}
                </div>
                <div className="lobby-dim" />
                <div className="lobby-auth-content">
                    <header className="lobby-auth-brand" aria-label="게임 타이틀">
                        <span>Overwatch</span>
                        <span>Card Game</span>
                    </header>
                    <div className="lobby-auth-card">
                        <h2>배틀태그를 입력해주세요</h2>
                        <input
                            className="lobby-input"
                            placeholder="닉네임 입력"
                            value={nicknameInput}
                            maxLength={20}
                            onChange={(e) => setNicknameInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !authLoading) createGuestSession();
                            }}
                        />
                        <button className="lobby-solid-btn" onClick={createGuestSession} disabled={authLoading}>
                            {authLoading ? '입장 중...' : '확인'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`lobby-page ${useCompactMenuLayout ? 'mobile' : 'desktop'}`}>
            {queueing && (
                <div className={`queue-status-banner ${useCompactMenuLayout ? 'mobile' : 'desktop'}`}>
                    <div className="queue-status-left">
                        <div className="queue-status-label">퀵매칭 · {queueFormat.toUpperCase()}</div>
                        <div className="queue-status-text">게임 찾는 중...</div>
                    </div>
                    <div className="queue-status-right">
                        <div className="queue-status-time">{queueElapsedMin}:{queueElapsedRemainSec}</div>
                        <button
                            className="queue-status-cancel"
                            onClick={() => {
                                if (!connected) {
                                    addLog('로비 연결이 끊겨 취소 요청을 보낼 수 없습니다.');
                                    return;
                                }
                                send({ action: 'leave_queue' });
                            }}
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}
            <div className={bgClassName} style={bgMotionStyle}>
                {backgroundImage && (
                    <img
                        src={backgroundImage}
                        alt=""
                        aria-hidden="true"
                        className="lobby-background-image"
                        onLoad={handleBackgroundImageLoad}
                    />
                )}
            </div>
            <div className="lobby-dim" />

            <div className={`lobby-shell ${useCompactMenuLayout ? 'compact' : ''}`}>
                <aside className={menuClassName}>
                    {activeMenu === 'play' && playMode === 'private' ? (
                        <div className="private-back-wrap">
                            <button className="lobby-ghost-btn private-back-btn" onClick={handleBackToLobby}>
                                로비로 돌아가기
                            </button>
                        </div>
                    ) : (
                        <>
                            {useCompactMenuLayout ? (
                                <div className="mobile-menu-buttons">
                                    <button className="lobby-solid-btn" onClick={() => openMenu('play')}>플레이</button>
                                    <button className="lobby-solid-btn" onClick={() => openMenu('deck')}>덱 수정</button>
                                    <button className="lobby-solid-btn" onClick={() => openMenu('rules')}>게임 규칙</button>
                                    <button className="lobby-solid-btn" onClick={() => openMenu('status-effects')}>상태 효과 정보</button>
                                    {session?.is_admin && (
                                        <button className="lobby-solid-btn" onClick={() => openMenu('admin')}>관리자 페이지</button>
                                    )}
                                </div>
                            ) : (
                                <div className="desktop-menu-text">
                                    <button className={`menu-text-item ${activeMenu === 'play' ? 'active' : ''}`} onClick={() => openMenu('play')}>플레이</button>
                                    <button className={`menu-text-item ${activeMenu === 'deck' ? 'active' : ''}`} onClick={() => openMenu('deck')}>덱 수정</button>
                                    <button className={`menu-text-item ${activeMenu === 'rules' ? 'active' : ''}`} onClick={() => openMenu('rules')}>게임 규칙</button>
                                    <button className={`menu-text-item ${activeMenu === 'status-effects' ? 'active' : ''}`} onClick={() => openMenu('status-effects')}>상태 효과 정보</button>
                                    {session?.is_admin && (
                                        <button className={`menu-text-item ${activeMenu === 'admin' ? 'active' : ''}`} onClick={() => openMenu('admin')}>관리자 페이지</button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </aside>

                <main className="lobby-main">
                    {activeMenu === 'play' && playMode === 'private' && (
                        <section className="panel private-room-grid">
                            <div>
                                <h3>사설방</h3>
                                <div className="mode-segment-wrap">
                                    <button
                                        className={`lobby-ghost-btn ${privateRoomFormat === 'bo1' ? 'active' : ''}`}
                                        onClick={() => setPrivateRoomFormat('bo1')}
                                    >
                                        BO1 사설방
                                    </button>
                                    <button
                                        className={`lobby-ghost-btn ${privateRoomFormat === 'bo3' ? 'active' : ''}`}
                                        onClick={() => setPrivateRoomFormat('bo3')}
                                    >
                                        BO3 사설방
                                    </button>
                                </div>

                                <div className="deck-row">
                                    <label>사용할 덱</label>
                                    <select className="lobby-input" value={deckId} onChange={(e) => setDeckId(Number(e.target.value))}>
                                        {decks.length === 0 ? (
                                            <option value={deckId}>덱 없음</option>
                                        ) : (
                                            decks.map((d) => (
                                                // <option key={d.id} value={d.id}>{d.name} (ID: {d.id})</option>
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))
                                        )}
                                    </select>
                                </div>

                                <div className="inline-actions">
                                    <button className="lobby-solid-btn" onClick={handleCreateRoom}>방 만들기</button>
                                </div>
                                {privateRoomLimitMessage && (
                                    <div className="empty-text" style={{ marginTop: 8 }}>
                                        {privateRoomLimitMessage}
                                    </div>
                                )}

                                <div className="join-by-code">
                                    <label>방 코드로 입장</label>
                                    <div>
                                        <input
                                            className="lobby-input"
                                            placeholder="예: ABC123"
                                            value={roomCode}
                                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                                        />
                                        <button className="lobby-ghost-btn" onClick={() => handleJoinRoom()}>입장</button>
                                    </div>
                                </div>

                                {room && (
                                    <div className="current-room">
                                        <div className="current-room-title">현재 방: {room.room_code}</div>
                                        <div>모드: <b>{(room.match_format ?? 'bo1').toUpperCase()}</b></div>
                                        <div>상태: <b>{room.status}</b></div>
                                        <div>방장: <b>{room.host.username}</b></div>
                                        <div>참가자: <b>{room.guest?.username ?? '대기 중'}</b></div>
                                        {isHost && (
                                            <button className="lobby-solid-btn" onClick={() => send({ action: 'start_game', room_id: room.room_id })}>게임 시작</button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3>열린 방 목록</h3>
                                <div className="room-list-wrap">
                                    {rooms.filter((r) => (r.match_format ?? 'bo1') === privateRoomFormat).length === 0 && <div className="empty-text">현재 열린 {privateRoomFormat.toUpperCase()} 방이 없음.</div>}
                                    {rooms.filter((r) => (r.match_format ?? 'bo1') === privateRoomFormat).map((r) => (
                                        <div className="room-item" key={r.room_id}>
                                            <div className="room-item-info">
                                                <div className="room-item-title room-item-playerline">{r.host.username} vs {r.guest?.username ?? '빈 자리'}</div>
                                                <div className="room-item-sub room-item-code">{r.room_code} · {(r.match_format ?? 'bo1').toUpperCase()}</div>
                                            </div>
                                            <button
                                                className="lobby-ghost-btn"
                                                disabled={r.status !== 'waiting' && r.status !== 'in_game'}
                                                onClick={() => {
                                                    if (r.status === 'in_game') {
                                                        handleSpectateRoom(r);
                                                        return;
                                                    }
                                                    setPendingJoinRoom(r);
                                                }}
                                            >
                                                {r.status === 'in_game' ? '관전' : '참가'}
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="log-wrap">
                                    <div className="log-title">로그</div>
                                    <div className="log-list">
                                        {logs.map((log, i) => <div key={i}>{log}</div>)}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </main>
            </div>

            {showPlayModal && (
                <div className="play-modal-backdrop" role="dialog" aria-modal="true">
                    <div className={`play-modal ${useCompactMenuLayout ? '' : 'play-selection-modal'}`.trim()}>
                        <button className="play-modal-close" onClick={() => setShowPlayModal(false)}>×</button>
                        <h3>게임 플레이</h3>
                        <p>플레이 타입을 선택하세요.</p>
                        <div className={`play-entry-grid ${useCompactMenuLayout ? 'mobile' : 'desktop'}`}>
                            <button
                                className="play-entry-card quick"
                                onClick={() => handlePlayEntrySelect('quick')}
                                type="button"
                            >
                                <div className="play-entry-icon play-entry-icon-quick" aria-hidden="true" />
                                <div className="play-entry-title">{queueing && queueFormat === 'bo1' ? '빠른대전 취소' : '빠른대전'}</div>
                                <div className="play-entry-desc">BO1 퀵매칭으로 빠르게 게임을 시작합니다.</div>
                            </button>
                            <button
                                className="play-entry-card competitive"
                                onClick={() => handlePlayEntrySelect('competitive')}
                                type="button"
                            >
                                <div className="play-entry-icon play-entry-icon-competitive" aria-hidden="true" />
                                <div className="play-entry-title">{queueing && queueFormat === 'bo3' ? '경쟁전 취소' : '경쟁전'}</div>
                                <div className="play-entry-desc">BO3 퀵매칭으로 실력을 겨루는 경쟁 모드입니다.</div>
                            </button>
                            <button
                                className="play-entry-card private"
                                onClick={() => handlePlayEntrySelect('private')}
                                type="button"
                            >
                                <div className="play-entry-icon play-entry-icon-private" aria-hidden="true" />
                                <div className="play-entry-title">사설방</div>
                                <div className="play-entry-desc">방 생성 시 BO1/BO3를 선택하고 원하는 룰로 플레이합니다.</div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingJoinRoom && (
                <div className="play-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="play-modal">
                        <button className="play-modal-close" onClick={() => setPendingJoinRoom(null)}>×</button>
                        <h3>방 참가</h3>
                        <p><b>{pendingJoinRoom.room_code}</b> 방에 참가할까요?</p>
                        <div className="play-modal-actions">
                            <button
                                className="lobby-ghost-btn"
                                onClick={() => {
                                    handleJoinRoom(pendingJoinRoom.room_code);
                                    setPendingJoinRoom(null);
                                }}
                            >
                                참가하기
                            </button>
                            <button className="lobby-ghost-btn" onClick={() => setPendingJoinRoom(null)}>취소</button>
                        </div>
                    </div>
                </div>
            )}

            {showQuickDeckModal && (
                <div className="play-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="play-modal">
                        <button className="play-modal-close" onClick={() => setShowQuickDeckModal(false)}>×</button>
                        <h3>퀵매칭 덱 선택 ({quickMatchFormat.toUpperCase()})</h3>
                        <p>{quickMatchFormat.toUpperCase()} 퀵매칭에 사용할 덱을 골라주세요.</p>
                        <div className="deck-row quick-match-deck-row">
                            <label>사용할 덱</label>
                            <select
                                className="lobby-input"
                                value={quickMatchDeckId}
                                onChange={(e) => setQuickMatchDeckId(Number(e.target.value))}
                            >
                                {decks.length === 0 ? (
                                    <option value={1}>덱 없음</option>
                                ) : (
                                    decks.map((d) => (
                                        // <option key={d.id} value={d.id}>{d.name} (ID: {d.id})</option>
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))
                                )}
                            </select>
                        </div>
                        <div className="play-modal-actions">
                            <button className="lobby-ghost-btn" disabled={!decks.length} onClick={confirmQuickMatch}>
                                매칭 시작
                            </button>
                            <button className="lobby-ghost-btn" onClick={() => setShowQuickDeckModal(false)}>닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LobbyPage;