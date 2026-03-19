import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LobbySocket, buildWsUrl, getApiBase } from '../api/ws';

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

const cardStyle: React.CSSProperties = {
    background: '#111832',
    border: '1px solid #2a3560',
    borderRadius: 12,
    padding: 16,
};

const buttonStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid #3a4a78',
    background: '#243055',
    color: '#e8ecf8',
    fontWeight: 700,
    cursor: 'pointer',
};

const primaryButton: React.CSSProperties = {
    ...buttonStyle,
    background: '#ff9b30',
    color: '#0a0e1a',
    border: 'none',
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #33406b',
    background: '#0d1225',
    color: '#e8ecf8',
    outline: 'none',
    boxSizing: 'border-box',
};

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
    const [logs, setLogs] = useState<string[]>([]);
    const [queueing, setQueueing] = useState(false);

    const addLog = useCallback((msg: string) => {
        setLogs((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
    }, []);

    const refreshRooms = useCallback(async () => {
        try {
            const res = await fetch(`${getApiBase()}/rooms`);
            const data = await res.json();
            setRooms(Array.isArray(data) ? data : []);
        } catch {
            addLog('방 목록을 불러오지 못했습니다.');
        }
    }, [addLog]);

    useEffect(() => {
        refreshRooms();
        const id = window.setInterval(refreshRooms, 3000);
        return () => window.clearInterval(id);
    }, [refreshRooms]);

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
            refreshRooms();
        });

        const offRoomJoined = ws.on('room_joined', (msg: any) => {
            setRoom(msg.room);
            addLog(`방 참가 완료 (${msg.room.room_code})`);
            refreshRooms();
        });

        const offGuestJoined = ws.on('guest_joined', (msg: any) => {
            setRoom(msg.room);
            addLog(`상대가 입장했습니다: ${msg.room.guest?.username ?? 'Guest'}`);
            refreshRooms();
        });

        const offRoomUpdated = ws.on('room_updated', (msg: any) => {
            setRoom(msg.room);
            addLog('방 정보가 업데이트되었습니다.');
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

        const offDeckSet = ws.on('deck_set', () => {
            addLog(`덱 ${deckId} 적용 요청 완료`);
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
            offDeckSet();
            offError();
            ws.disconnect();
        };
    }, [session, addLog, navigate, refreshRooms, deckId]);

    const createGuestSession = async () => {
        const nickname = nicknameInput.trim();
        if (nickname.length < 2) {
            addLog('닉네임은 2글자 이상으로 해줘.');
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
            addLog(`게스트 입장 완료: ${nextSession.nickname}`);
        } catch (e: any) {
            addLog(`게스트 입장 실패: ${e.message}`);
        } finally {
            setAuthLoading(false);
        }
    };

    const send = (data: Record<string, unknown>) => {
        wsRef.current?.send(data);
    };

    const handleCreateRoom = () => send({ action: 'create_room' });

    const handleJoinRoom = () => {
        if (!roomCode.trim()) {
            addLog('방 코드를 입력해줘.');
            return;
        }
        send({ action: 'join_room', room_code: roomCode.trim().toUpperCase() });
    };

    const handleSetDeck = () => {
        if (!room) {
            addLog('먼저 방에 들어가야 해.');
            return;
        }
        send({ action: 'set_deck', room_id: room.room_id, deck_id: deckId });
    };

    const handleStartGame = () => {
        if (!room) return;
        send({ action: 'start_game', room_id: room.room_id });
    };

    const handleJoinQueue = () => {
        send({ action: 'join_queue', deck_id: deckId });
    };

    const handleLeaveQueue = () => {
        send({ action: 'leave_queue' });
    };

    const isHost = room?.host.id === session?.player_id;

    if (!session) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#e8ecf8', display: 'grid', placeItems: 'center' }}>
                <div style={{ ...cardStyle, width: 420, textAlign: 'center' }}>
                    <h2 style={{ marginTop: 0 }}>닉네임 입력</h2>
                    <p style={{ color: '#8a94b8', marginBottom: 16 }}>
                        처음 접속할 때 닉네임만 입력하고 바로 로비에 들어갑니다.
                    </p>

                    <input
                        style={inputStyle}
                        placeholder="닉네임 입력"
                        value={nicknameInput}
                        maxLength={20}
                        onChange={(e) => setNicknameInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !authLoading) createGuestSession();
                        }}
                    />

                    <button
                        style={{ ...primaryButton, width: '100%', marginTop: 12, opacity: authLoading ? 0.7 : 1 }}
                        onClick={createGuestSession}
                        disabled={authLoading}
                    >
                        {authLoading ? '입장 중...' : '로비 입장'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0e1a 0%, #111832 100%)',
                color: '#e8ecf8',
                padding: 24,
                boxSizing: 'border-box',
            }}
        >
            <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 16 }}>
                <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: 26, fontWeight: 900 }}>오버워치 카드게임 로비</div>
                        <div style={{ color: '#8a94b8', marginTop: 6 }}>
                            유저: <b>{session.nickname}</b> / player_id: {session.player_id}
                        </div>
                    </div>
                    <div style={{ fontWeight: 800, color: connected ? '#22dd77' : '#ff4466' }}>
                        {connected ? '● 연결됨' : '○ 연결 안 됨'}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16 }}>
                    <div style={{ ...cardStyle }}>
                        <h3 style={{ marginTop: 0 }}>내 방 / 매칭</h3>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ display: 'block', fontSize: 13, color: '#8a94b8', marginBottom: 6 }}>사용할 덱 ID</label>
                            <input
                                style={inputStyle}
                                type="number"
                                value={deckId}
                                onChange={(e) => setDeckId(Number(e.target.value))}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                            <button style={primaryButton} onClick={handleCreateRoom}>방 만들기</button>
                            {!queueing ? (
                                <button style={buttonStyle} onClick={handleJoinQueue}>퀵매칭</button>
                            ) : (
                                <button style={buttonStyle} onClick={handleLeaveQueue}>매칭 취소</button>
                            )}
                        </div>

                        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #243055' }}>
                            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>방 코드로 입장</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    style={inputStyle}
                                    placeholder="예: ABC123"
                                    value={roomCode}
                                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                                />
                                <button style={buttonStyle} onClick={handleJoinRoom}>입장</button>
                            </div>
                        </div>

                        {room && (
                            <div style={{ marginTop: 22, padding: 14, borderRadius: 10, background: '#0d1225', border: '1px solid #243055' }}>
                                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
                                    현재 방: {room.room_code}
                                </div>

                                <div style={{ fontSize: 13, color: '#8a94b8', marginBottom: 6 }}>
                                    상태: <b style={{ color: '#e8ecf8' }}>{room.status}</b>
                                </div>

                                <div style={{ fontSize: 13, color: '#8a94b8', marginBottom: 6 }}>
                                    방장: <b style={{ color: '#e8ecf8' }}>{room.host.username}</b>
                                </div>

                                <div style={{ fontSize: 13, color: '#8a94b8', marginBottom: 10 }}>
                                    참가자: <b style={{ color: '#e8ecf8' }}>{room.guest?.username ?? '대기 중'}</b>
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button style={buttonStyle} onClick={handleSetDeck}>내 덱 적용</button>
                                    {isHost && (
                                        <button style={primaryButton} onClick={handleStartGame}>
                                            게임 시작
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ ...cardStyle }}>
                        <h3 style={{ marginTop: 0 }}>열린 방 목록</h3>

                        <div style={{ display: 'grid', gap: 8 }}>
                            {rooms.length === 0 && (
                                <div style={{ color: '#8a94b8' }}>현재 열린 방이 없어.</div>
                            )}

                            {rooms.map((r) => (
                                <div
                                    key={r.room_id}
                                    style={{
                                        padding: 12,
                                        borderRadius: 10,
                                        background: '#0d1225',
                                        border: '1px solid #243055',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: 12,
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 800 }}>
                                            {r.room_code} · {r.status}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#8a94b8', marginTop: 4 }}>
                                            {r.host.username} vs {r.guest?.username ?? '대기 중'}
                                        </div>
                                    </div>

                                    <button
                                        style={buttonStyle}
                                        disabled={r.status !== 'waiting'}
                                        onClick={() => {
                                            setRoomCode(r.room_code);
                                            send({ action: 'join_room', room_code: r.room_code });
                                        }}
                                    >
                                        입장
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #243055' }}>
                            <div style={{ fontWeight: 800, marginBottom: 8 }}>로그</div>
                            <div style={{ maxHeight: 280, overflowY: 'auto', fontSize: 12, color: '#8a94b8' }}>
                                {logs.map((log, i) => (
                                    <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #111832' }}>
                                        {log}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LobbyPage;