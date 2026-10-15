import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const NotificationContext = createContext({ unread: 0, refresh: () => {}, live: false, lastEvent: null });

/** Subscribes to the user's live channel; shows toasts and keeps an unread badge in sync. */
export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const [lastEvent, setLastEvent] = useState(null);

  const refresh = useCallback(() => {
    if (!user) return;
    api.get('/notifications', { params: { size: 1 } }).then(({ data }) => setUnread(data.unread)).catch(() => {});
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const live = useSocket('/ws/notifications', (msg) => {
    setLastEvent(msg);
    if (msg.type === 'notification') {
      setUnread((n) => n + 1);
      toast(msg.data.title, 'info');
    }
  }, !!user);

  return (
    <NotificationContext.Provider value={{ unread, setUnread, refresh, live, lastEvent }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
