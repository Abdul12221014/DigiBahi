import { getWebSocketUrl } from '@/lib/api-config';

let socket: WebSocket | null = null;
const listeners: Array<(msg: any) => void> = [];

export function connectWS() {
  try {
    socket = new WebSocket(getWebSocketUrl());
    socket.onmessage = (ev) => {
      try { const data = JSON.parse(ev.data); listeners.forEach(l => l(data)); } catch { /* invalid JSON — skip */ }
    };
    socket.onclose = () => { socket = null; setTimeout(connectWS, 3000); };
  } catch {
    setTimeout(connectWS, 5000);
  }
}

export function onWSMessage(fn: (msg: any) => void) { listeners.push(fn); }

export default { connectWS, onWSMessage };


