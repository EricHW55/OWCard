import type { WSMessage } from '../types/game';

type Handler = (msg: WSMessage) => void;

class SocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Handler[]>();

  connect(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this.emit({ event: '_connected' });
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
      this.emit({ event: '_disconnected' });
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error', err);
      this.emit({ event: '_error', message: 'socket error' });
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

export function getApiBase(): string {
  return process.env.REACT_APP_API_BASE || 'http://localhost:8000';
}

export function getWsBase(): string {
  const apiBase = getApiBase();
  if (apiBase.startsWith('https://')) return apiBase.replace('https://', 'wss://');
  if (apiBase.startsWith('http://')) return apiBase.replace('http://', 'ws://');
  return `ws://${apiBase}`;
}

export function buildWsUrl(
    path: string,
    query: Record<string, string | number | boolean | undefined>
): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });

  return `${getWsBase()}${path}?${params.toString()}`;
}