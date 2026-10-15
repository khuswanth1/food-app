import { useEffect, useRef, useState } from 'react';
import { wsUrl } from '../api/client';

/** Auto-reconnecting WebSocket with keep-alive. `onMessage` receives parsed JSON. */
export function useSocket(path, onMessage, enabled = true) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !path) return undefined;
    let ws; let ping; let retry; let closed = false; let attempt = 0;

    const open = () => {
      ws = new WebSocket(wsUrl(path));
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
      };
      ws.onmessage = (e) => {
        try { handler.current?.(JSON.parse(e.data)); } catch { /* ignore malformed */ }
      };
      ws.onclose = (e) => {
        setConnected(false);
        clearInterval(ping);
        if (!closed && e.code < 4400) retry = setTimeout(open, Math.min(1000 * 2 ** attempt++, 15000));
      };
    };
    open();
    return () => { closed = true; clearInterval(ping); clearTimeout(retry); ws?.close(); };
  }, [path, enabled]);

  return connected;
}
