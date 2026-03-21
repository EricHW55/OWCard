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

function readEnv(name: string): string {
  try {
    // Vite
    const viteEnv =
        typeof import.meta !== 'undefined' &&
        (import.meta as any).env &&
        (import.meta as any).env[name];

    if (typeof viteEnv === 'string' && viteEnv.trim()) {
      return viteEnv.trim();
    }
  } catch {}

  try {
    // CRA / webpack
    const processEnv =
        typeof process !== 'undefined' &&
        process.env &&
        process.env[name];

    if (typeof processEnv === 'string' && processEnv.trim()) {
      return processEnv.trim();
    }
  } catch {}

  return '';
}

export function getApiBase(): string {
  const explicitBase =
      readEnv('VITE_API_BASE_URL') ||
      readEnv('REACT_APP_API_BASE');

  console.log('[DEBUG] REACT_APP_API_BASE =', readEnv('REACT_APP_API_BASE'));
  console.log('[DEBUG] explicitBase =', explicitBase);


  if (explicitBase) {
    return explicitBase.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location;

    // 로컬 개발 환경
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }

    // 배포 환경: 프론트와 같은 origin 사용
    // HTTPS 페이지면 자동으로 HTTPS API를 바라보게 됨
    if (protocol === 'https:' || protocol === 'http:') {
      return origin.replace(/\/+$/, '');
    }
  }

  return 'http://localhost:8000';
}

export function getWsBase(): string {
  const explicitWsBase =
      readEnv('VITE_WS_BASE_URL') ||
      readEnv('REACT_APP_WS_BASE');

  if (explicitWsBase) {
    return explicitWsBase.replace(/\/+$/, '');
  }

  const apiBase = getApiBase();

  if (apiBase.startsWith('https://')) return apiBase.replace('https://', 'wss://');
  if (apiBase.startsWith('http://')) return apiBase.replace('http://', 'ws://');

  if (typeof window !== 'undefined') {
    const isHttps = window.location.protocol === 'https:';
    return `${isHttps ? 'wss' : 'ws'}://${window.location.host}`;
  }

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