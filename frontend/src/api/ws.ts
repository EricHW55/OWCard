import type { WSMessage } from '../types/game';

type Handler = (msg: WSMessage) => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();

  connect(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.emit({ event: '_connected' } as WSMessage);
    };

    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        console.log('[WS] ←', msg.event, msg);
        this.emit(msg);
      } catch {
        console.warn('[WS] Invalid message');
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.emit({ event: '_disconnected' } as WSMessage);
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error', err);
      this.emit({ event: '_error', message: 'socket error' } as WSMessage);
    };
  }

  private emit(msg: WSMessage) {
    (this.handlers.get(msg.event) || []).forEach((h) => h(msg));
    (this.handlers.get('*') || []).forEach((h) => h(msg));
  }

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);

    return () => {
      const arr = this.handlers.get(event) || [];
      this.handlers.set(event, arr.filter((h) => h !== handler));
    };
  }

  send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WS] →', data);
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export class GameSocket extends SocketClient {}
export class LobbySocket extends SocketClient {}

const REACT_APP_API_BASE =
    (process.env.REACT_APP_API_BASE || '').trim().replace(/\/+$/, '');

const REACT_APP_WS_BASE =
    (process.env.REACT_APP_WS_BASE || '').trim().replace(/\/+$/, '');

export function getApiBase(): string {
  console.log('[DEBUG] REACT_APP_API_BASE =', REACT_APP_API_BASE);

  if (REACT_APP_API_BASE) {
    return REACT_APP_API_BASE;
  }

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }

    // env 없을 때만 같은 origin fallback
    return origin.replace(/\/+$/, '');
  }

  return 'http://localhost:8000';
}

export function getWsBase(): string {
  console.log('[DEBUG] REACT_APP_WS_BASE =', REACT_APP_WS_BASE);

  if (REACT_APP_WS_BASE) {
    return REACT_APP_WS_BASE;
  }

  const apiBase = getApiBase();

  if (apiBase.startsWith('https://')) return apiBase.replace('https://', 'wss://');
  if (apiBase.startsWith('http://')) return apiBase.replace('http://', 'ws://');

  return 'ws://localhost:8000';
}

export function buildWsUrl(
    path: string,
    query: Record<string, string | number | boolean | undefined>
): string {
  const base = getWsBase().replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  const qs = params.toString();
  return `${base}${cleanPath}${qs ? `?${qs}` : ''}`;
}