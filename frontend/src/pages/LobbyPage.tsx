import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbySocket, buildWsUrl, getApiBase } from '../api/ws';
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
}

interface SessionInfo {
    token: string;
    player_id: number;
    username: string;
    nickname: string;
}

interface DeckInfo {
    id: number;
    player_id: number;
    name: string;
    cards: Array<{ card_template_id: number; quantity: number }>;
}

type MenuKey = 'play' | 'deck' | 'rules';
type PlayMode = 'none' | 'quick' | 'private';
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
];

const LobbyPage: React.FC = () => {
    const navigate = useNavigate();
    const wsRef = useRef<LobbySocket | null>(null);

    const [session, setSession] = useState<SessionInfo | null>(() => getSession());
    const [nicknameInput, setNicknameInput] = useState('');
    const [authLoading, setAuthLoading] = useState(false);

    const [connected, setConnected] = useState(false);
    const [room, setRoom] = useState<RoomInfo | null>(null);
    const [rooms, setRooms] = useState<RoomInfo[]>([]);
    const [roomCode, setRoomCode] = useState('');
    const [deckId, setDeckId] = useState<number>(1);
    const [decks, setDecks] = useState<DeckInfo[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [queueing, setQueueing] = useState(false);
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
    const [pendingJoinRoom, setPendingJoinRoom] = useState<RoomInfo | null>(null);
    const backgroundNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);

    const addLog = useCallback((msg: string) => {
        setLogs((prev) => [...prev.slice(-29), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    }, []);

    const send = useCallback((data: Record<string, unknown>) => {
        wsRef.current?.send(data);
    }, []);

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

        const ws = new LobbySocket();
        wsRef.current = ws;

        const url = buildWsUrl('/ws/lobby', {
            token: session.token,
            player_id: session.player_id,
            username: session.username,
        });

        ws.connect(url);

        const offConnected = ws.on('_connected', () => {
            setConnected(true);
            addLog('로비 서버 연결됨');
        });

        const offDisconnected = ws.on('_disconnected', () => {
            setConnected(false);
            addLog('로비 서버 연결 종료');
        });

        const offRoomCreated = ws.on('room_created', (msg: any) => {
            setRoom(msg.room);
            addLog(`방 생성 완료 (${msg.room.room_code})`);
            applyDeckToRoom(msg.room.room_id);
            setPlayMode('private');
            setShowPlayModal(false);
            refreshRooms();
        });

        const offRoomJoined = ws.on('room_joined', (msg: any) => {
            setRoom(msg.room);
            addLog(`방 참가 완료 (${msg.room.room_code})`);
            applyDeckToRoom(msg.room.room_id);
            setPlayMode('private');
            setShowPlayModal(false);
            refreshRooms();
        });

        const offGuestJoined = ws.on('guest_joined', (msg: any) => {
            setRoom(msg.room);
            addLog(`상대가 입장했습니다: ${msg.room.guest?.username ?? 'Guest'}`);
            refreshRooms();
        });

        const offRoomUpdated = ws.on('room_updated', (msg: any) => {
            setRoom(msg.room);
            refreshRooms();
        });

        const offMatchFound = ws.on('match_found', (msg: any) => {
            addLog(`퀵매칭 완료! 상대: ${msg.opponent?.username ?? '상대'}`);
            navigate(`/game/${msg.game_id}`);
        });

        const offGameStarting = ws.on('game_starting', (msg: any) => {
            addLog(`게임 시작: ${msg.game_id}`);
            navigate(`/game/${msg.game_id}`);
        });

        const offQueueJoined = ws.on('queue_joined', (msg: any) => {
            setQueueing(true);
            addLog(`매칭 대기열 참가. 현재 큐 인원: ${msg.queue_size}`);
        });

        const offQueueLeft = ws.on('queue_left', () => {
            setQueueing(false);
            addLog('매칭 대기열에서 나왔습니다.');
        });

        const offError = ws.on('error', (msg: any) => {
            addLog(`오류: ${msg.message}`);
        });

        return () => {
            offConnected();
            offDisconnected();
            offRoomCreated();
            offRoomJoined();
            offGuestJoined();
            offRoomUpdated();
            offMatchFound();
            offGameStarting();
            offQueueJoined();
            offQueueLeft();
            offError();
            ws.disconnect();
        };
    }, [session, addLog, navigate, refreshRooms, applyDeckToRoom]);

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
            };

            sessionStorage.setItem('access_token', nextSession.token);
            sessionStorage.setItem('player_id', String(nextSession.player_id));
            sessionStorage.setItem('username', nextSession.username);
            sessionStorage.setItem('nickname', nextSession.nickname);

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
        }
    };

    const startQuickMatch = () => {
        setPlayMode('quick');
        setActiveMenu('play');
        if (queueing) {
            send({ action: 'leave_queue' });
            setShowPlayModal(false);
            return;
        }
        send({ action: 'join_queue', deck_id: deckId });
        setShowPlayModal(false);
    };

    const openPrivateLobby = () => {
        setActiveMenu('play');
        setPlayMode('private');
        setShowPlayModal(false);
    };

    const handleCreateRoom = () => {
        if (!decks.length) {
            addLog('덱이 없어 방을 만들 수 없습니다. 덱 빌더에서 덱을 먼저 만들어주세요.');
            return;
        }
        send({ action: 'create_room' });
    };

    const handleJoinRoom = (code?: string) => {
        const joiningCode = (code ?? roomCode).trim().toUpperCase();
        if (!joiningCode) {
            addLog('방 코드를 입력해줘.');
            return;
        }
        setRoomCode(joiningCode);
        send({ action: 'join_room', room_code: joiningCode });
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
    const menuClassName = `lobby-menu ${useCompactMenuLayout && showMainMenu ? 'main-menu-mode' : ''}`.trim();
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
                <div className="lobby-auth-card">
                    <h2>배틀태그 입력</h2>
                    <p>배틀태그 입력시 바로 로비에 들어갑니다.</p>
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
                        {authLoading ? '입장 중...' : '로비 입장'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`lobby-page ${useCompactMenuLayout ? 'mobile' : 'desktop'}`}>
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
                                </div>
                            ) : (
                                <div className="desktop-menu-text">
                                    <button className={`menu-text-item ${activeMenu === 'play' ? 'active' : ''}`} onClick={() => openMenu('play')}>플레이</button>
                                    <button className={`menu-text-item ${activeMenu === 'deck' ? 'active' : ''}`} onClick={() => openMenu('deck')}>덱 수정</button>
                                    <button className={`menu-text-item ${activeMenu === 'rules' ? 'active' : ''}`} onClick={() => openMenu('rules')}>게임 규칙</button>
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

                                <div className="deck-row">
                                    <label>사용할 덱</label>
                                    <select className="lobby-input" value={deckId} onChange={(e) => setDeckId(Number(e.target.value))}>
                                        {decks.length === 0 ? (
                                            <option value={deckId}>덱 없음</option>
                                        ) : (
                                            decks.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name} (ID: {d.id})</option>
                                            ))
                                        )}
                                    </select>
                                </div>

                                <div className="inline-actions">
                                    <button className="lobby-solid-btn" onClick={handleCreateRoom}>방 만들기</button>
                                </div>

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
                                    {rooms.length === 0 && <div className="empty-text">현재 열린 방이 없음.</div>}
                                    {rooms.map((r) => (
                                        <div className="room-item" key={r.room_id}>
                                            <div>
                                                <div className="room-item-title">{r.room_code} · {r.status}</div>
                                                <div className="room-item-sub">{r.host.username} vs {r.guest?.username ?? '대기 중'}</div>
                                            </div>
                                            <button
                                                className="lobby-ghost-btn"
                                                disabled={r.status !== 'waiting'}
                                                onClick={() => setPendingJoinRoom(r)}
                                            >
                                                참가
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
                    <div className="play-modal">
                        <button className="play-modal-close" onClick={() => setShowPlayModal(false)}>×</button>
                        <h3>게임 플레이</h3>
                        <p>모드를 선택하세요.</p>
                        <div className="play-modal-actions">
                            <button className="lobby-ghost-btn" onClick={startQuickMatch}>
                                {queueing ? '퀵매칭 취소' : '퀵매칭'}
                            </button>
                            <button className="lobby-ghost-btn" onClick={openPrivateLobby}>사설방</button>
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
        </div>
    );
};

export default LobbyPage;